// Tracks which jobs have been cancelled so OCR loops can exit early
const cancelled = new Set()

export const jobRegistry = {
  cancel(jobId) { cancelled.add(jobId) },
  isCancelled(jobId) { return cancelled.has(jobId) },
  cleanup(jobId) { cancelled.delete(jobId) }
}
