// Browser upload pipeline: {slug}/{galleryId}/{tier}/{hash8}_{filename} objects
// recorded via record_image_upload(), which consumes the token server-side.
// Keys are deterministic, so a retry overwrites orphans instead of piling up.

import { recordImageUpload } from '@/shared/data/images'
import { uploadStorageObject } from '@/shared/data/storage'
import { makeDisplayCopies } from './displayCopies'

const BUCKET = 'gallery-images'

export interface UploadResult {
  imageId: string
  filename: string
  webPath: string
  thumbPath: string
  originalPath: string
  originalSize: number
  publicThumbPresent: boolean
}

export interface UploadProgress {
  phase: 'compress' | 'thumb' | 'web' | 'original' | 'record' | 'done' | 'error'
  message?: string
}

export type ProgressFn = (p: UploadProgress) => void

// ── Upload validation: the single source of truth for upload limits ─────────
// Drag-and-drop bypasses the input's accept filter, so uploadMany enforces these too.
// JPEG/PNG/WebP only (HEIC can't be transformed yet); the batch cap is a guardrail, not a gallery limit.

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200 MB per image
export const MAX_UPLOAD_BATCH = 5000             // files per selection (concurrency is 8)

const ALLOWED_UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type UploadRejectReason = 'heic' | 'unsupported' | 'empty' | 'too_large'

/** Returns a machine reason if the file must be rejected, or null if valid. */
export function validateUploadFile(file: File): UploadRejectReason | null {
  const type = (file?.type || '').toLowerCase()
  const name = file?.name || ''
  // HEIC/HEIF first — it often reports a blank MIME, so match by extension too.
  if (type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(name)) return 'heic'
  if (!ALLOWED_UPLOAD_MIME.has(type)) return 'unsupported'
  if (!file || file.size === 0) return 'empty'
  if (file.size > MAX_UPLOAD_BYTES) return 'too_large'
  return null
}

export interface UploadPartition {
  valid: File[]
  rejected: Array<{ file: File; reason: UploadRejectReason }>
  /** True when more than MAX_UPLOAD_BATCH valid files were selected; `valid`
   *  is capped to the first MAX_UPLOAD_BATCH and the rest should be re-added. */
  truncated: boolean
}

/** Split a selection into files we'll upload vs. rejected files with reasons,
 *  and cap the batch size. */
export function partitionUploadFiles(files: File[]): UploadPartition {
  const valid: File[] = []
  const rejected: Array<{ file: File; reason: UploadRejectReason }> = []
  for (const file of files) {
    const reason = validateUploadFile(file)
    if (reason) rejected.push({ file, reason })
    else valid.push(file)
  }
  const truncated = valid.length > MAX_UPLOAD_BATCH
  return { valid: truncated ? valid.slice(0, MAX_UPLOAD_BATCH) : valid, rejected, truncated }
}

// ── string + filename helpers ──────────────────────────────────────────────

export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '')
    || `img_${Date.now()}`
}

/** Same FNV-1a 32-bit hash the desktop uses to namespace cloud paths. */
export function pathHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function buildPath(slug: string, galleryId: string,
                   kind: 'thumbs' | 'web' | 'originals',
                   hash: string, filename: string): string {
  return `${slug}/${galleryId}/${kind}/${hash}_${filename}`
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')) }
    img.src = url
  })
}

// ── Storage uploads ─────────────────────────────────────────────────────────

// Content-addressed paths never change bytes, so cache for a year instead of
// Supabase's 1h default (which forced slow hourly origin re-fetches).
const ONE_YEAR_CACHE = '31536000'

// Upsert one object with a few retries, throwing the last error. A transient blip on
// one of thousands of uploads must not fail the whole image; content-addressed
// paths make the retry overwrite the same key, so no garbage accrues.
export async function uploadWithRetry(
  bucket: string, path: string, body: Blob | File, contentType: string,
): Promise<void> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await uploadStorageObject(bucket, path, body, {
      upsert: true, contentType, cacheControl: ONE_YEAR_CACHE,
    })
    if (!error) return
    lastErr = error
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
  }
  throw lastErr
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface UploadOptions {
  galleryId: string
  businessSlug: string
  sectionId?: string | null
  sortOrder?: number
  onProgress?: ProgressFn
}

interface StoredPaths { originalPath: string; webPath: string; thumbPath: string }

/** Upload the original plus its 2048px web and 640px thumb copies. The viewer
 *  serves the copies directly; if the browser can't make them, all three paths
 *  point at the original and the viewer transforms it on the fly instead. */
async function uploadImageObjects(
  file: File, businessSlug: string, galleryId: string, onProgress?: ProgressFn,
): Promise<StoredPaths> {
  const hash     = pathHash(`${galleryId}/${file.name}/${file.size}/${file.lastModified}`)
  const origPath = buildPath(businessSlug, galleryId, 'originals', hash, file.name)

  onProgress?.({ phase: 'original' })
  // Resizing runs in a worker, so it overlaps the network-bound original upload.
  const [, copies] = await Promise.all([
    uploadWithRetry(BUCKET, origPath, file, file.type || 'image/jpeg'),
    uploadDisplayCopies(file, businessSlug, galleryId, hash),
  ])
  return copies
    ? { originalPath: origPath, ...copies }
    : { originalPath: origPath, webPath: origPath, thumbPath: origPath }
}

async function uploadDisplayCopies(
  file: File, businessSlug: string, galleryId: string, hash: string,
): Promise<{ webPath: string; thumbPath: string } | null> {
  const copies = await makeDisplayCopies(file)
  if (!copies) return null
  const name = sanitizeFilename(file.name).replace(/\.[^.]*$/, '') + '.jpg'
  const webPath   = buildPath(businessSlug, galleryId, 'web', hash, name)
  const thumbPath = buildPath(businessSlug, galleryId, 'thumbs', hash, name)
  try {
    await Promise.all([
      uploadWithRetry(BUCKET, webPath, copies.web, 'image/jpeg'),
      uploadWithRetry(BUCKET, thumbPath, copies.thumb, 'image/jpeg'),
    ])
    return { webPath, thumbPath }
  } catch {
    return null
  }
}

/** Upload one image and record it. */
async function uploadOneImage(file: File, opts: UploadOptions): Promise<UploadResult> {
  const { galleryId, businessSlug, sectionId, sortOrder, onProgress } = opts
  const { originalPath, webPath, thumbPath } = await uploadImageObjects(file, businessSlug, galleryId, onProgress)

  onProgress?.({ phase: 'record' })
  // original_uploaded becomes true so HD downloads resolve immediately.
  const { data, error } = await recordImageUpload({
    p_gallery_id:            galleryId,
    p_filename:              file.name,
    p_web_preview_path:      webPath,
    p_thumbnail_path:        thumbPath,
    p_original_path:         originalPath,
    p_original_size:         file.size,
    p_section_id:            sectionId ?? null,
    p_sort_order:            sortOrder ?? 0,
    p_public_thumb_present:  false,
  })
  if (error) throw error
  const imageId = String(data)

  onProgress?.({ phase: 'done' })
  return {
    imageId, filename: file.name,
    webPath, thumbPath, originalPath,
    originalSize: file.size,
    publicThumbPresent: false,
  }
}

/** Upload a replacement image (original + display copies) without recording a
 *  row or consuming a token. Content-addressed, so it never collides with the
 *  objects it replaces. */
export async function uploadReplacementImage(
  file: File,
  opts: { galleryId: string; businessSlug: string; onProgress?: ProgressFn },
): Promise<StoredPaths & { size: number }> {
  const reason = validateUploadFile(file)
  if (reason) throw new Error(reason)
  const { galleryId, businessSlug, onProgress } = opts
  const paths = await uploadImageObjects(file, businessSlug, galleryId, onProgress)
  onProgress?.({ phase: 'done' })
  return { ...paths, size: file.size }
}

/** Best-effort decode of an image file's intrinsic pixel dimensions. Returns
 *  nulls if decoding is unavailable — callers must tolerate that. */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file)
      const dims = { width: bmp.width || null, height: bmp.height || null }
      bmp.close()
      return dims
    }
    const img = await loadImageElement(file)
    return { width: img.naturalWidth || null, height: img.naturalHeight || null }
  } catch {
    return { width: null, height: null }
  }
}

/** Run a list of uploads with bounded concurrency. Per-file errors are
 *  surfaced via the callback so one bad file (e.g. a corrupt jpeg) doesn't
 *  abort the whole batch. */
export interface BatchProgress {
  completed: number
  total: number
  failed: number
  current?: string
}

export async function uploadMany(
  files: File[],
  opts: UploadOptions,
  onBatch: (b: BatchProgress) => void,
  concurrency = 8,
): Promise<{ ok: UploadResult[]; failed: Array<{ file: File; error: string }> }> {
  const results: UploadResult[] = []
  const failed: Array<{ file: File; error: string }> = []
  let i = 0
  let completed = 0
  const total = files.length

  async function worker() {
    while (true) {
      const idx = i++
      if (idx >= total) return
      const file = files[idx]
      onBatch({ completed, total, failed: failed.length, current: file.name })
      // Defensive gate: never upload a non-image / HEIC / oversized file, even
      // if a caller forgot to pre-filter. Keeps storage + tokens clean.
      const rejectReason = validateUploadFile(file)
      if (rejectReason) {
        failed.push({ file, error: rejectReason })
        completed++
        onBatch({ completed, total, failed: failed.length, current: file.name })
        continue
      }
      try {
        const r = await uploadOneImage(file, {
          ...opts, sortOrder: (opts.sortOrder ?? 0) + idx,
        })
        results.push(r)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        failed.push({ file, error: msg })
      }
      completed++
      onBatch({ completed, total, failed: failed.length, current: file.name })
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
  await Promise.all(workers)
  return { ok: results, failed }
}
