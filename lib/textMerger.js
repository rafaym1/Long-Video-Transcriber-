// Merge OCR text from multiple frames into a single document,
// deduplicating paragraphs that appear in consecutive frames due to scrolling.

function normalizeParagraph(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation/markdown
    .replace(/\s+/g, ' ')
    .trim()
}

// Jaccard similarity on word sets — tolerates minor OCR variance between frames
function similarity(a, b) {
  if (!a || !b) return 0
  const setA = new Set(a.split(' ').filter(w => w.length > 2))
  const setB = new Set(b.split(' ').filter(w => w.length > 2))
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

function paragraphsMatch(a, b) {
  return similarity(normalizeParagraph(a), normalizeParagraph(b)) >= 0.75
}

// Find the longest suffix of `committed` that matches a prefix of `incoming`.
// Returns the overlap length (paragraphs to skip from the start of incoming).
function findOverlap(committed, incoming) {
  const maxOverlap = Math.min(committed.length, incoming.length)

  for (let k = maxOverlap; k >= 1; k--) {
    const tail = committed.slice(committed.length - k)
    const head = incoming.slice(0, k)
    if (tail.every((p, i) => paragraphsMatch(p, head[i]))) {
      return k
    }
  }

  return 0
}

// Takes array of { frameIndex, text } from ocrProcessor and returns merged string.
export function merge(ocrResults) {
  if (ocrResults.length === 0) return ''

  // Split each frame's text into non-trivial paragraphs
  const frameParas = ocrResults.map(r =>
    r.text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 10)
  )

  if (frameParas.length === 0 || frameParas[0].length === 0) return ''

  const committed = [...frameParas[0]]

  for (let f = 1; f < frameParas.length; f++) {
    const incoming = frameParas[f]
    if (incoming.length === 0) continue

    const overlap = findOverlap(committed, incoming)
    const newParas = incoming.slice(overlap)
    committed.push(...newParas)
  }

  return committed.join('\n\n')
}
