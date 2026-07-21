// Separate cover-image upload — a cover that lives in the gallery bucket but
// is NOT a gallery photo (no `images` row, so it never appears in the grid).
//
// Path scheme keeps the gallery id as the SECOND segment so the existing
// storage RLS applies unchanged:
//   {slug}/{galleryId}/covers/{hash8}_{filename}
//   • gallery_storage_owner_write  → only the owning business can upload/delete
//   • gallery_storage_public_read  → anon can read once the gallery is 'live'
// (both policies key on (storage.foldername(name))[2] = galleryId).
//
// We deliberately do NOT call record_image_upload(): no token is consumed and
// no images row is created. The path is stored in delivery_settings.
//
// The file is downscaled client-side before upload. Covers under `covers/`
// are served as plain public objects (displayUrl only transforms `/originals/`),
// so the stored size IS what the public hero downloads — capping it keeps the
// hero fast. The private gate uses a separate small render transform.

import { supabase, storageUrl } from '../supabase'
import {
  validateUploadFile,
  sanitizeFilename,
  pathHash,
  type UploadRejectReason,
} from './uploadPipeline'

const BUCKET = 'gallery-images'

// Cap the stored cover. 2560 covers retina hero widths without shipping a
// multi-MB original to every visitor.
const COVER_MAX_DIM = 2560
const COVER_JPEG_QUALITY = 0.85

export type CoverUploadPhase = 'validating' | 'processing' | 'uploading' | 'done' | 'error'

export interface CoverUploadResult {
  /** Storage path — save to delivery_settings.coverImagePath. */
  path: string
  /** Stable public URL — save to delivery_settings.coverImageUrl. */
  url: string
  width: number
  height: number
}

export class CoverUploadError extends Error {
  reason: UploadRejectReason | 'upload_failed' | 'decode_failed'
  constructor(reason: CoverUploadError['reason'], message?: string) {
    super(message ?? reason)
    this.reason = reason
    this.name = 'CoverUploadError'
  }
}

interface ResizeOut { blob: Blob; width: number; height: number }

// Self-contained canvas downscale (mirrors uploadPipeline's approach but kept
// local so this module has no dependency on its non-exported internals).
async function downscaleToJpeg(file: File, maxDim: number, quality: number): Promise<ResizeOut> {
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
    } else {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        const u = URL.createObjectURL(file)
        img.onload = () => { URL.revokeObjectURL(u); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('decode failed')) }
        img.src = u
      })
    }
  } catch {
    throw new CoverUploadError('decode_failed', 'could not decode image')
  }
  const srcW = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth
  const srcH = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const dstW = Math.max(1, Math.round(srcW * scale))
  const dstH = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new CoverUploadError('decode_failed', 'no 2d context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, dstW, dstH)
  if ('close' in bitmap) (bitmap as ImageBitmap).close()

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
  if (!blob) throw new CoverUploadError('decode_failed', 'canvas.toBlob null')
  return { blob, width: dstW, height: dstH }
}

/**
 * Upload a separate cover image for a gallery. Validates (same rules as photo
 * uploads), downscales, uploads to `covers/`, and returns the path + public
 * URL. Does not create an images row and does not consume a token.
 */
export async function uploadCoverImage(
  file: File,
  opts: { galleryId: string; businessSlug: string; onPhase?: (p: CoverUploadPhase) => void },
): Promise<CoverUploadResult> {
  const { galleryId, businessSlug, onPhase } = opts

  onPhase?.('validating')
  const reject = validateUploadFile(file)
  if (reject) throw new CoverUploadError(reject)

  onPhase?.('processing')
  const { blob, width, height } = await downscaleToJpeg(file, COVER_MAX_DIM, COVER_JPEG_QUALITY)

  // Content-addressed name so replacing with a different file yields a new
  // path (natural cache-bust); re-uploading the same file overwrites in place.
  const hash = pathHash(`${galleryId}/${file.name}/${blob.size}/${file.lastModified}`)
  const baseName = sanitizeFilename(file.name).replace(/\.[^.]+$/, '') || 'cover'
  const path = `${businessSlug}/${galleryId}/covers/${hash}_${baseName}.jpg`

  onPhase?.('uploading')
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' })
    if (!error) {
      onPhase?.('done')
      return { path, url: storageUrl(BUCKET, path), width, height }
    }
    lastErr = error
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
  }
  onPhase?.('error')
  throw new CoverUploadError('upload_failed', lastErr instanceof Error ? lastErr.message : String(lastErr))
}

/**
 * Delete a previously-uploaded custom cover object. GUARDED: only removes
 * paths under a `covers/` folder, so a real gallery photo can never be deleted
 * through this path even if a stale value is passed. Best-effort — a failed
 * delete (already gone, transient) resolves quietly; the owner's RLS gates the
 * actual permission server-side.
 */
export async function deleteCoverObject(path: string | null | undefined): Promise<void> {
  if (!path || !/\/covers\//.test(path)) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    /* best-effort: RLS-authorized owner only; ignore transient/absent */
  }
}
