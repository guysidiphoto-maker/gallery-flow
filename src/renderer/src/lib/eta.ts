import type { QueueItem } from './uploadTypes'

/** Format a seconds count as a compact "2m 14s" / "45s" / "1h 3m" string. */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '…'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const mRem = m % 60
  return mRem > 0 ? `${h}h ${mRem}m` : `${h}h`
}

/** Format bytes as a human-readable string (KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return '0 B'
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`
  return `${bytes} B`
}

/**
 * Compute total / completed bytes from a QueueItem list. `inProgress` items
 * are counted as partially done (50% by convention, since TUS chunks stream
 * without byte-level callbacks into the store).
 */
export function computeByteProgress(items: QueueItem[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const it of items) {
    const size = it.sizeBytes || 0
    total += size
    if (it.status === 'completed') done += size
    else if (it.status === 'in_progress') done += size * 0.5
  }
  return { done, total }
}

/**
 * ETA from start time + byte progress. Returns null until we have enough
 * data for a stable estimate (≥3 s elapsed and ≥1% done).
 */
export function computeEtaSeconds(
  startedAt: number | null,
  doneBytes: number,
  totalBytes: number,
  nowMs: number = Date.now()
): number | null {
  if (!startedAt || totalBytes <= 0 || doneBytes <= 0) return null
  const elapsedSec = (nowMs - startedAt) / 1000
  if (elapsedSec < 3) return null
  const ratio = doneBytes / totalBytes
  if (ratio < 0.01) return null
  const rateBytesPerSec = doneBytes / elapsedSec
  if (rateBytesPerSec <= 0) return null
  return (totalBytes - doneBytes) / rateBytesPerSec
}

/**
 * ETA from a percent value (0-100) and a start time. Used for processes
 * that report progress as a percentage (video encode, image export).
 */
export function computeEtaFromPercent(
  startedAt: number | null,
  percent: number,
  nowMs: number = Date.now()
): number | null {
  if (!startedAt || percent <= 0) return null
  const elapsedSec = (nowMs - startedAt) / 1000
  if (elapsedSec < 2) return null
  if (percent >= 100) return 0
  const totalSec = elapsedSec / (percent / 100)
  return totalSec - elapsedSec
}
