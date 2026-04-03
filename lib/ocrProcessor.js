import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { sseManager } from './sseManager.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an OCR engine specialized in extracting text from screen recordings of word processors.

Your task is to extract ALL visible text from the provided screenshot EXACTLY as it appears, preserving:
- Paragraph breaks (use double newlines between paragraphs)
- Line breaks within paragraphs
- Headings (prefix with # for h1, ## for h2, ### for h3 based on visual size/weight)
- Bold and italic text (use **bold** and _italic_ markdown)
- Bullet points and numbered lists (preserve their structure)
- Tab indentation (use spaces to approximate)

Do NOT include:
- The word processor UI chrome (toolbars, ribbon, status bar, scroll bars, rulers)
- Page margins indicators
- Watermarks that say "Page X of Y"
- Any text that is clearly UI rather than document content

If the document content is partially cut off at the top or bottom of the screen due to scrolling, extract what is visible. Do NOT try to infer what is above or below the visible area.

If the screenshot shows no document text (blank page, UI only, loading screen), respond with exactly: [NO_TEXT]

Respond with ONLY the extracted text. No preamble, no explanation, no commentary.`

const USER_PROMPT = `Extract all document text visible in this screenshot.`

// OCR all unique frames sequentially, reporting progress via SSE.
// Returns array of { frameIndex, text } objects (no [NO_TEXT] entries).
export async function processAll(jobId, framePaths) {
  const results = []

  for (let i = 0; i < framePaths.length; i++) {
    sseManager.send(jobId, {
      type: 'progress',
      stage: 'ocr',
      current: i + 1,
      total: framePaths.length,
      message: `Reading frame ${i + 1} of ${framePaths.length}...`
    })

    const imageData = readFileSync(framePaths[i]).toString('base64')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageData }
          },
          { type: 'text', text: USER_PROMPT }
        ]
      }]
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    if (text && text !== '[NO_TEXT]') {
      results.push({ frameIndex: i, text })
    }

    // Brief delay between calls to avoid API burst limits
    if (i < framePaths.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return results
}
