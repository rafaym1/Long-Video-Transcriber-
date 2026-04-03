import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { mkdir, readdir } from 'fs/promises'
import path from 'path'

ffmpeg.setFfmpegPath(ffmpegPath)

// Extract frames at 0.5fps (1 frame every 2 seconds) from the uploaded video.
// Returns sorted array of absolute frame file paths.
export async function extract(jobId) {
  const framesDir = path.join('tmp', jobId, 'frames')
  await mkdir(framesDir, { recursive: true })

  const videoPath = path.join('tmp', jobId, 'video.mp4')
  const outputPattern = path.join(framesDir, 'frame_%04d.jpg')

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-vf fps=0.5,scale=1280:-1', // 1 frame/2s, max width 1280px
        '-qscale:v 3'                 // High quality JPEG (1=best, 31=worst)
      ])
      .output(outputPattern)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })

  const files = await readdir(framesDir)
  return files
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(framesDir, f))
}
