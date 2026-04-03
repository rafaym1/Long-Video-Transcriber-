# Video Transcriber

Extract text from screen recordings of Word documents (or any document/text-heavy screen recording). Upload a video, get back the full document text — word by word, in your browser.

Built because Claude's web UI refuses to transcribe videos longer than ~30 seconds.

---

## How it works

1. **Frame extraction** — FFmpeg pulls 1 frame every 2 seconds from your video
2. **Deduplication** — Near-identical frames (e.g. user paused scrolling) are skipped to save API calls
3. **OCR** — Each unique frame is sent to Claude Vision, which reads the document text and ignores UI chrome (toolbars, scroll bars, rulers)
4. **Text merging** — Overlapping paragraphs across consecutive scroll frames are deduplicated using Jaccard similarity, producing a single clean document
5. **Streaming** — The final text is streamed back to your browser word by word

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
git clone https://github.com/your-username/video-transcriber.git
cd video-transcriber
npm install
```

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

---

## Usage

```bash
node server.js
```

Open `http://localhost:3000`, upload your screen recording, and wait. Progress is shown in real time. When done, copy the extracted text with the Copy button.

---

## Video length limits

| Video length | Raw frames (0.5 fps) | Unique frames (after dedup) | Approx. processing time |
|---|---|---|---|
| 2 minutes | ~60 | ~30–40 | ~1.5 min |
| 5 minutes | ~150 | ~60–80 | ~3 min |
| 10 minutes | ~300 | ~100–130 | ~5–6 min |
| 30 minutes | ~900 | ~250–350 | ~15–20 min |

Processing time is dominated by sequential Claude Vision API calls (~2 seconds each). The SSE connection stays open for the full duration, so there are no HTTP timeouts.

**Practical limit without any code changes: ~10 minutes.**

---

## Transcribing longer videos

To handle videos longer than 10 minutes, make two changes in `server.js` and `lib/frameExtractor.js`:

### 1. Reduce frame rate in `lib/frameExtractor.js`

```js
// Default (good for 2–5 min videos):
'-vf fps=0.5,scale=1280:-1'

// For 10–20 min videos (1 frame every 4 seconds):
'-vf fps=0.25,scale=1280:-1'

// For 20–60 min videos (1 frame every 10 seconds):
'-vf fps=0.1,scale=1280:-1'
```

Lower fps means fewer API calls and faster processing, at the cost of potentially missing a scroll position. For slow/steady scrolling through a document, `fps=0.1` is usually sufficient.

### 2. Increase the file size limit in `server.js`

```js
// Default (500 MB):
limits: { fileSize: 500 * 1024 * 1024 }

// For larger files (2 GB):
limits: { fileSize: 2 * 1024 * 1024 * 1024 }
```

### 3. (Optional) Speed up processing with parallel OCR

By default, frames are processed one at a time to stay within API rate limits. If you have a high-tier Anthropic account, you can process multiple frames in parallel in `lib/ocrProcessor.js`:

```js
// Replace the sequential for loop with batched parallel calls:
const BATCH_SIZE = 3 // process 3 frames at a time

for (let i = 0; i < framePaths.length; i += BATCH_SIZE) {
  const batch = framePaths.slice(i, i + BATCH_SIZE)
  const batchResults = await Promise.all(batch.map((fp, j) => ocrFrame(fp, i + j)))
  results.push(...batchResults.filter(Boolean))
}
```

With `BATCH_SIZE = 3` and a high-rate-limit account, processing time drops to roughly 1/3.

---

## Tech stack

- **Backend**: Node.js + Express
- **Frame extraction**: fluent-ffmpeg + ffmpeg-static (no system FFmpeg install needed)
- **OCR**: Claude Vision (`claude-sonnet-4-6`)
- **Frontend**: Vanilla HTML/CSS/JS, no build step
- **Streaming**: Server-Sent Events (SSE)

---

## License

MIT
