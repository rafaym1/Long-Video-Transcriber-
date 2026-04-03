// SSE connection registry with buffering for race condition safety
const connections = new Map() // jobId → Express res
const queues = new Map()      // jobId → buffered events (before SSE connects)

function writeEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export const sseManager = {
  register(jobId, res) {
    connections.set(jobId, res)
    // Drain any events that fired before the SSE connection opened
    const buffered = queues.get(jobId) || []
    for (const event of buffered) {
      writeEvent(res, event)
    }
    queues.delete(jobId)

    res.on('close', () => {
      connections.delete(jobId)
    })
  },

  send(jobId, data) {
    const res = connections.get(jobId)
    if (res) {
      writeEvent(res, data)
    } else {
      // Buffer until SSE client connects
      if (!queues.has(jobId)) queues.set(jobId, [])
      queues.get(jobId).push(data)
    }
  },

  cleanup(jobId) {
    const res = connections.get(jobId)
    if (res) {
      res.end()
      connections.delete(jobId)
    }
    queues.delete(jobId)
  }
}
