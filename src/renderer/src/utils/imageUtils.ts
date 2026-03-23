import type { ImageFile, DuplicateGroup } from '../types'

/** Convert a local file path to a gallery-protocol URL for use in <img> src */
export function toLocalURL(filePath: string): string {
  // localfile:// protocol is registered in the main process
  return `localfile://${encodeURIComponent(filePath).replace(/%2F/g, '/')}`
}

/**
 * Load EXIF capture time for a single image.
 * Returns null if EXIF is unavailable.
 */
export async function loadExifTime(image: ImageFile): Promise<number | null> {
  try {
    // exifr works in the browser/renderer
    // Dynamic import keeps it out of the critical path
    const exifr = await import('exifr')
    const exif = await exifr.parse(image.path, { tiff: true, exif: true })
    const dt = exif?.DateTimeOriginal ?? exif?.DateTime ?? exif?.CreateDate
    if (dt instanceof Date) return dt.getTime()
    if (typeof dt === 'string') {
      // EXIF datetime format: "2024:06:15 14:30:00"
      const normalized = dt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const d = new Date(normalized)
      return isNaN(d.getTime()) ? null : d.getTime()
    }
    return null
  } catch {
    return null
  }
}

/**
 * Load EXIF camera model for a single image.
 */
export async function loadExifCamera(image: ImageFile): Promise<string | null> {
  try {
    const exifr = await import('exifr')
    const exif = await exifr.parse(image.path, { tiff: true })
    return exif?.Model ?? exif?.Make ?? null
  } catch {
    return null
  }
}

/**
 * Generate a perceptual fingerprint by downscaling to 8x8 via Canvas.
 * Returns a 64-element Uint8ClampedArray (grayscale pixel values).
 *
 * Note: runs in the renderer — only call for duplicate detection, not on load.
 */
export function computeImageHash(src: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 8, 8)
      const data = ctx.getImageData(0, 0, 8, 8).data
      // Convert to grayscale
      const gray = new Uint8Array(64)
      for (let i = 0; i < 64; i++) {
        const r = data[i * 4]
        const g = data[i * 4 + 1]
        const b = data[i * 4 + 2]
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      }
      resolve(gray)
    }
    img.onerror = reject
    img.src = src
  })
}

/**
 * Hamming distance between two 8x8 perceptual hashes.
 * Returns 0–64; values ≤ 10 are likely duplicates/similar.
 */
export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let dist = 0
  const meanA = a.reduce((s, v) => s + v, 0) / a.length
  const meanB = b.reduce((s, v) => s + v, 0) / b.length
  for (let i = 0; i < 64; i++) {
    const bitA = a[i] >= meanA ? 1 : 0
    const bitB = b[i] >= meanB ? 1 : 0
    if (bitA !== bitB) dist++
  }
  return dist
}

/**
 * Detect duplicate groups across a set of images.
 * Uses two-pass strategy: first group by size, then compare hashes for size matches.
 *
 * Calls onProgress(completed, total) so the UI can show progress.
 */
export async function detectDuplicates(
  images: ImageFile[],
  onProgress?: (done: number, total: number) => void
): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = []

  // Pass 1: group by file size (exact duplicates)
  const bySize = new Map<number, string[]>()
  for (const img of images) {
    const bucket = bySize.get(img.size) ?? []
    bucket.push(img.id)
    bySize.set(img.size, bucket)
  }

  const sizeDups = [...bySize.values()].filter(g => g.length > 1)

  if (sizeDups.length === 0) {
    // No size matches — skip expensive hash pass
    onProgress?.(images.length, images.length)
    return []
  }

  // Pass 2: compute perceptual hashes for candidates only
  const candidates = new Set(sizeDups.flat())
  const hashes = new Map<string, Uint8Array>()
  const imgById = new Map(images.map(img => [img.id, img]))

  let done = 0
  const total = candidates.size

  for (const id of candidates) {
    const img = imgById.get(id)!
    try {
      const hash = await computeImageHash(toLocalURL(img.path))
      hashes.set(id, hash)
    } catch { /* skip if image fails to load */ }
    onProgress?.(++done, total)
    // Yield to keep UI responsive
    await new Promise(r => setTimeout(r, 0))
  }

  // Group by perceptual similarity
  const visited = new Set<string>()
  for (const sizeGroup of sizeDups) {
    const similar: string[] = []
    for (let i = 0; i < sizeGroup.length; i++) {
      if (visited.has(sizeGroup[i])) continue
      const cluster = [sizeGroup[i]]
      const ha = hashes.get(sizeGroup[i])
      if (!ha) continue

      for (let j = i + 1; j < sizeGroup.length; j++) {
        if (visited.has(sizeGroup[j])) continue
        const hb = hashes.get(sizeGroup[j])
        if (!hb) continue
        if (hammingDistance(ha, hb) <= 10) {
          cluster.push(sizeGroup[j])
          visited.add(sizeGroup[j])
        }
      }
      visited.add(sizeGroup[i])
      if (cluster.length > 1) similar.push(...cluster)
    }
    if (similar.length > 1) {
      groups.push({ ids: similar, reason: 'similar-hash' })
    }
  }

  return groups
}
