// Browser upload pipeline: {slug}/{galleryId}/{tier}/{hash8}_{filename} objects
// recorded via record_image_upload(), which consumes the token server-side.
// Keys are deterministic, so a retry overwrites orphans instead of piling up.

import { supabase } from '@/shared/lib/supabase'

const BUCKET = 'gallery-images'
// Thumbs are dual-written to the public bucket for crawlers/OG. Best-effort:
// failure never blocks the upload; a backfill reconciles public_thumb_present.
const THUMB_PUBLIC_BUCKET = 'gallery-images-thumbs-public'

const WEB_MAX_DIM       = 1600
const WEB_JPEG_QUALITY  = 0.82
const THUMB_MAX_DIM     = 360
const THUMB_JPEG_QUALITY = 0.75

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

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200 MB per image
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

// ── Canvas resize ──────────────────────────────────────────────────────────

interface ResizeResult { blob: Blob; width: number; height: number }

async function resizeToBlob(file: File, maxDim: number, quality: number): Promise<ResizeResult> {
  // createImageBitmap is the fast path; fall back to <img> for older browsers.
  let bitmap: ImageBitmap | HTMLImageElement
  if (typeof createImageBitmap === 'function') {
    bitmap = await createImageBitmap(file)
  } else {
    bitmap = await loadImageElement(file)
  }
  const srcW = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth
  const srcH = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const dstW = Math.max(1, Math.round(srcW * scale))
  const dstH = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, dstW, dstH)

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
  if ('close' in bitmap) (bitmap as ImageBitmap).close()
  if (!blob) throw new Error('canvas.toBlob returned null')
  return { blob, width: dstW, height: dstH }
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

// Upload one object with a few retries. A transient network/throttle blip on
// one of thousands of uploads must not fail the whole image — the path is
// content-addressed so the retry overwrites the same key, no garbage accrues.
async function uploadOne(
  bucket: string, path: string, body: Blob | File, contentType: string,
): Promise<void> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, body, { upsert: true, contentType, cacheControl: ONE_YEAR_CACHE })
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

/** Upload one original and record it. Every display size is an on-the-fly,
 *  CDN-cached transform of this object, so no client-side resizing. */
export async function uploadOneImage(file: File, opts: UploadOptions): Promise<UploadResult> {
  const { galleryId, businessSlug, sectionId, sortOrder, onProgress } = opts
  const hash     = pathHash(`${galleryId}/${file.name}/${file.size}/${file.lastModified}`)
  const origPath = buildPath(businessSlug, galleryId, 'originals', hash, file.name)

  onProgress?.({ phase: 'original' })
  await uploadOne(BUCKET, origPath, file, file.type || 'image/jpeg')

  onProgress?.({ phase: 'record' })
  // All path columns point at the original; sizes are derived on demand and
  // original_uploaded becomes true so HD downloads resolve immediately.
  const { data, error } = await supabase.rpc('record_image_upload', {
    p_gallery_id:            galleryId,
    p_filename:              file.name,
    p_web_preview_path:      origPath,
    p_thumbnail_path:        origPath,
    p_original_path:         origPath,
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
    webPath: origPath, thumbPath: origPath, originalPath: origPath,
    originalSize: file.size,
    publicThumbPresent: false,
  }
}

/** Upload an original without recording a row or consuming a token (photo
 *  replace). Content-addressed, so it never collides with the object it replaces. */
export async function uploadReplacementOriginal(
  file: File,
  opts: { galleryId: string; businessSlug: string; onProgress?: ProgressFn },
): Promise<{ path: string; size: number }> {
  const reason = validateUploadFile(file)
  if (reason) throw new Error(reason)
  const { galleryId, businessSlug, onProgress } = opts
  const hash     = pathHash(`${galleryId}/${file.name}/${file.size}/${file.lastModified}`)
  const origPath = buildPath(businessSlug, galleryId, 'originals', hash, file.name)
  onProgress?.({ phase: 'original' })
  await uploadOne(BUCKET, origPath, file, file.type || 'image/jpeg')
  onProgress?.({ phase: 'done' })
  return { path: origPath, size: file.size }
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

function ensureJpgExt(name: string): string {
  if (/\.(jpe?g)$/i.test(name)) return name
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name) + '.jpg'
}
