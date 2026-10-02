// Small worker pool for display-copy resizing. Uploads run 8-wide but each
// decode of a large original holds hundreds of MB, so resizing is capped at 2.

import type { DisplayCopyResult } from './displayCopySizes'

export interface DisplayCopies { web: Blob; thumb: Blob }

const POOL_SIZE = 2
// A decode that hangs (corrupt file, OOM'd worker) must not stall the upload.
const JOB_TIMEOUT_MS = 60_000

interface Job { file: File; resolve: (r: DisplayCopies | null) => void }

const queue: Job[] = []
const idle: Worker[] = []
let spawned = 0
// Set when a worker can't be created (e.g. CSP); later uploads skip straight to the fallback.
let broken = false

function supported(): boolean {
  return !broken
    && typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function'
}

function spawn(): Worker | null {
  try {
    const worker = new Worker(new URL('./displayCopyWorker.ts', import.meta.url), { type: 'module' })
    spawned++
    return worker
  } catch {
    broken = true
    return null
  }
}

function run(worker: Worker, job: Job) {
  let settled = false
  const finish = (result: DisplayCopies | null, healthy: boolean) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    worker.onmessage = null
    worker.onerror = null
    if (healthy) idle.push(worker)
    else { worker.terminate(); spawned-- }
    job.resolve(result)
    pump()
  }
  const timer = setTimeout(() => finish(null, false), JOB_TIMEOUT_MS)
  worker.onmessage = (e: MessageEvent<DisplayCopyResult>) => {
    const r = e.data
    finish(r.ok ? { web: r.web, thumb: r.thumb } : null, true)
  }
  worker.onerror = () => finish(null, false)
  worker.postMessage(job.file)
}

function pump() {
  while (queue.length > 0) {
    const worker = idle.pop() ?? (spawned < POOL_SIZE ? spawn() : null)
    if (!worker) {
      // No worker will ever free up if none could be created.
      if (broken && spawned === 0) queue.splice(0).forEach(j => j.resolve(null))
      return
    }
    run(worker, queue.shift()!)
  }
}

/** Resize an upload into its stored display copies. Resolves null when the
 *  browser can't (no OffscreenCanvas, decode failure) — callers fall back to
 *  serving the original through transforms. Never rejects. */
export function makeDisplayCopies(file: File): Promise<DisplayCopies | null> {
  if (!supported()) return Promise.resolve(null)
  return new Promise(resolve => {
    queue.push({ file, resolve })
    pump()
  })
}
