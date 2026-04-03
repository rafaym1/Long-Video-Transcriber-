import { readFileSync, statSync } from 'fs'

// Sample 64 bytes at even intervals from a JPEG buffer as a lightweight fingerprint.
// Not a true perceptual hash, but sufficient for detecting near-identical frames
// without any external image library.
function sampleHash(buf) {
  const step = Math.max(1, Math.floor(buf.length / 64))
  const samples = []
  for (let i = 0; i < 64; i++) {
    samples.push(buf[i * step] ?? 0)
  }
  return samples
}

function hammingDistance(a, b) {
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++
  }
  return dist
}

// Two-layer deduplication:
//  Layer 1 - file size: near-identical JPEG frames compress to nearly the same size.
//  Layer 2 - byte sampling: catches slow scrolls where sizes differ but content barely changed.
// Returns the subset of framePaths that are visually distinct.
export function dedupe(framePaths) {
  const unique = []
  let lastSize = -1
  let lastHash = null

  for (const fp of framePaths) {
    const size = statSync(fp).size
    const sizeDiff = Math.abs(size - lastSize)

    // Layer 1: skip if file size differs by less than 1KB from previous
    if (lastSize !== -1 && sizeDiff < 1024) continue

    // Layer 2: byte-sample hash check
    const buf = readFileSync(fp)
    const hash = sampleHash(buf)
    if (lastHash !== null && hammingDistance(hash, lastHash) < 8) continue

    unique.push(fp)
    lastSize = size
    lastHash = hash
  }

  return unique
}
