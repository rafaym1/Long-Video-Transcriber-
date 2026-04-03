import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { mkdirSync, rmSync, renameSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'

import { extract } from './lib/frameExtractor.js'
import { dedupe } from './lib/frameDeduplicator.js'
import { processAll } from './lib/ocrProcessor.js'
import { merge } from './lib/textMerger.js'
import { sseManager } from './lib/sseManager.js'
import { jobRegistry } from './lib/jobRegistry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Clean and recreate tmp dir on startup
try { rmSync('tmp', { recursive: true, force: true }) } catch {}
mkdirSync('tmp', { recursive: true })

const app = express()
app.use(express.static(path.join(__dirname, 'public')))

const upload = multer({
  dest: 'tmp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true)
    else cb(new Error('Only video files are accepted'))
  }
})

// Upload endpoint — responds immediately with jobId, processes async
app.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided' })

  const jobId = uuidv4()
  const jobDir = path.join('tmp', jobId)
  mkdirSync(jobDir, { recursive: true })

  // Move multer's temp file to our job directory
  renameSync(req.file.path, path.join(jobDir, 'video.mp4'))

  res.status(202).json({ jobId })

  // Fire and forget — errors are sent via SSE
  processJob(jobId).catch(err => {
    console.error(`Job ${jobId} failed:`, err)
  })
})

// Cancel endpoint — marks job as cancelled; OCR loop exits on next iteration
app.post('/cancel/:jobId', (req, res) => {
  jobRegistry.cancel(req.params.jobId)
  res.json({ ok: true })
})

// SSE stream endpoint
app.get('/stream/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  sseManager.register(req.params.jobId, res)
})

async function processJob(jobId) {
  try {
    // Step 1: Extract frames
    sseManager.send(jobId, {
      type: 'progress',
      stage: 'extract',
      current: 0,
      total: 1,
      message: 'Extracting frames from video...'
    })

    const framePaths = await extract(jobId)

    sseManager.send(jobId, {
      type: 'progress',
      stage: 'extract',
      current: 1,
      total: 1,
      message: `Extracted ${framePaths.length} frames, deduplicating...`
    })

    if (jobRegistry.isCancelled(jobId)) return

    // Step 2: Deduplicate similar frames
    const uniqueFrames = dedupe(framePaths)

    sseManager.send(jobId, {
      type: 'progress',
      stage: 'ocr',
      current: 0,
      total: uniqueFrames.length,
      message: `Processing ${uniqueFrames.length} unique frames with OCR...`
    })

    // Step 3: OCR each unique frame
    const ocrResults = await processAll(jobId, uniqueFrames)

    sseManager.send(jobId, {
      type: 'progress',
      stage: 'merge',
      current: 1,
      total: 1,
      message: 'Merging text...'
    })

    if (jobRegistry.isCancelled(jobId)) return

    // Step 4: Merge overlapping paragraphs from scroll frames
    const mergedText = merge(ocrResults)

    if (!mergedText.trim()) {
      sseManager.send(jobId, { type: 'error', message: 'No text could be extracted from the video.' })
      return
    }

    // Step 5: Stream words one by one
    const tokens = mergedText.split(/(\s+)/)
    for (const token of tokens) {
      if (jobRegistry.isCancelled(jobId)) break
      sseManager.send(jobId, { type: 'word', token })
      await new Promise(r => setTimeout(r, 30))
    }

    sseManager.send(jobId, { type: 'done' })
  } catch (err) {
    sseManager.send(jobId, { type: 'error', message: err.message || 'Unknown error' })
  } finally {
    // Cleanup temp files and registry
    try { await rm(path.join('tmp', jobId), { recursive: true, force: true }) } catch {}
    jobRegistry.cleanup(jobId)
    sseManager.cleanup(jobId)
  }
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Transcription server running at http://localhost:${PORT}`)
})
