// Browser-side 3-tier upload pipeline.
//
// Per image:
//   1) Resize to a web preview (~1600px max side, jpeg 82%) via canvas
//   2) Resize to a thumbnail (~360px max side, jpeg 75%) via canvas
//   3) Upload thumbnail + web preview + the original to gallery-images
//   4) Call record_image_upload() — atomic: token consumed + images row
//
// Path scheme matches the desktop pipeline:
//   {slug}/{galleryId}/{thumbs|web|originals}/{hash8}_{filename}
//
// Token consumption is enforced server-side inside record_image_upload(); a
// failure there ('insufficient_tokens') aborts the storage cleanup the same
// way a network error would (we leave the orphaned objects for the next
// upload retry — the path is filename-deterministic so the same key gets
// overwritten on retry, no garbage accrues).

import { supabase } from '../supabase'

const BUCKET = 'gallery-images'
// Phase 4.2: thumbs are dual-written here (public bucket) for crawlers / OG /
// public previews. Same key as in `gallery-images`. Best-effort — failure here
// must NOT block the upload; the row is committed with public_thumb_present=false
// and the backfill function reconciles it later.
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

// Gallery assets are content-addressed (the path embeds an FNV hash of the
// file), so a given URL always points at the same bytes — it can be cached
// effectively forever. Supabase's default is only 3600s (1h), which let the
// CDN edge "cool off" hourly and forced slow origin re-fetches (~1.5s each)
// for every gallery viewer. 1 year matches what Pic-Time / Pixieset serve.
const ONE_YEAR_CACHE = '31536000'

async function uploadOne(
  bucket: string, path: string, body: Blob | File, contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { upsert: true, contentType, cacheControl: ONE_YEAR_CACHE })
  if (error) throw error
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface UploadOptions {
  galleryId: string
  businessSlug: string
  sectionId?: string | null
  sortOrder?: number
  onProgress?: ProgressFn
}

/** Upload one file end-to-end: compress, push 3 tiers, record. */
export async function uploadOneImage(file: File, opts: UploadOptions): Promise<UploadResult> {
  const { galleryId, businessSlug, sectionId, sortOrder, onProgress } = opts
  const safeName  = sanitizeFilename(file.name)
  const filename  = ensureJpgExt(safeName)
  const hash      = pathHash(`${galleryId}/${file.name}/${file.size}/${file.lastModified}`)
  const thumbPath = buildPath(businessSlug, galleryId, 'thumbs',    hash, filename)
  const webPath   = buildPath(businessSlug, galleryId, 'web',       hash, filename)
  const origPath  = buildPath(businessSlug, galleryId, 'originals', hash, file.name)

  onProgress?.({ phase: 'compress' })
  const [thumb, web] = await Promise.all([
    resizeToBlob(file, THUMB_MAX_DIM, THUMB_JPEG_QUALITY),
    resizeToBlob(file, WEB_MAX_DIM,   WEB_JPEG_QUALITY),
  ])

  onProgress?.({ phase: 'thumb' })
  // Dual-write: primary thumb is mandatory, public mirror is best-effort.
  const [, publicThumbPresent] = await Promise.all([
    uploadOne(BUCKET, thumbPath, thumb.blob, 'image/jpeg'),
    uploadOne(THUMB_PUBLIC_BUCKET, thumbPath, thumb.blob, 'image/jpeg')
      .then(() => true)
      .catch(() => false),
  ])

  onProgress?.({ phase: 'web' })
  await uploadOne(BUCKET, webPath, web.blob, 'image/jpeg')

  onProgress?.({ phase: 'original' })
  await uploadOne(BUCKET, origPath, file, file.type || 'image/jpeg')

  onProgress?.({ phase: 'record' })
  const { data, error } = await supabase.rpc('record_image_upload', {
    p_gallery_id:            galleryId,
    p_filename:              file.name,
    p_web_preview_path:      webPath,
    p_thumbnail_path:        thumbPath,
    p_original_path:         origPath,
    p_original_size:         file.size,
    p_section_id:            sectionId ?? null,
    p_sort_order:            sortOrder ?? 0,
    p_public_thumb_present:  publicThumbPresent,
  })
  if (error) throw error
  const imageId = String(data)

  onProgress?.({ phase: 'done' })
  return {
    imageId, filename: file.name,
    webPath, thumbPath, originalPath: origPath,
    originalSize: file.size,
    publicThumbPresent,
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
  concurrency = 3,
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
