// Replace the pixels behind an existing images row, keeping its identity.
// Upload new → transactional DB flip → delete old: any failure leaves the original
// usable, and a failed flip removes the freshly uploaded object.

import { replaceImage } from '@/shared/data/images'
import { removeStorageObjects } from '@/shared/data/storage'
import {
  uploadReplacementOriginal,
  readImageDimensions,
  validateUploadFile,
  type UploadRejectReason,
} from './uploadPipeline'

const BUCKET = 'gallery-images'

export type ReplacePhotoPhase = 'validate' | 'upload' | 'commit' | 'cleanup' | 'done'

export class ReplacePhotoError extends Error {
  constructor(message: string, readonly reason?: UploadRejectReason | string) {
    super(message)
    this.name = 'ReplacePhotoError'
  }
}

export interface ReplacePhotoResult {
  imageId: string
  newPath: string
  filename: string
  wasCover: boolean
}

export interface ReplacePhotoOptions {
  galleryId: string
  imageId: string
  businessSlug: string
  file: File
  onProgress?: (phase: ReplacePhotoPhase) => void
  /** Runs after the DB flip and before old objects are deleted, only for the
   *  cover: its delivery_settings reference must move to newPath first. */
  onRepointCover?: (newPath: string) => Promise<void>
}

// Old keys may also exist as dual-written public thumbnails; clean both buckets.
const CLEANUP_BUCKETS = [BUCKET, 'gallery-images-thumbs-public'] as const

async function removeObjects(paths: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)))
  if (unique.length === 0) return
  for (const bucket of CLEANUP_BUCKETS) {
    try {
      await removeStorageObjects(bucket, unique)
    } catch {
      /* best-effort — an orphaned object is reconciled by the storage sweep */
    }
  }
}

export async function replacePhoto(opts: ReplacePhotoOptions): Promise<ReplacePhotoResult> {
  const { galleryId, imageId, businessSlug, file, onProgress } = opts

  onProgress?.('validate')
  const rejectReason = validateUploadFile(file)
  if (rejectReason) throw new ReplacePhotoError(rejectReason, rejectReason)

  onProgress?.('upload')
  const dims = await readImageDimensions(file)
  const { path: newPath, size } = await uploadReplacementOriginal(file, { galleryId, businessSlug })

  onProgress?.('commit')
  const { data, error } = await replaceImage({
    p_gallery_id: galleryId,
    p_image_id: imageId,
    p_web_preview_path: newPath,
    p_thumbnail_path: newPath,
    p_original_path: newPath,
    p_filename: file.name,
    p_original_size: size,
    p_mime_type: file.type || null,
    p_width: dims.width,
    p_height: dims.height,
  })

  if (error || !data || (data as { ok?: boolean }).ok !== true) {
    // DB flip failed — the row still points at the old object. Drop the object
    // we just uploaded (unless it happens to be the same content-addressed key
    // the row already used) so a failed replace accrues no garbage.
    await removeObjects([newPath])
    throw new ReplacePhotoError(
      error?.message || 'replace_failed',
      (error as { message?: string })?.message,
    )
  }

  const result = data as {
    ok: boolean
    old_web_path: string | null
    old_thumb_path: string | null
    old_original_path: string | null
    was_cover: boolean
  }

  // Re-point the cover before deleting the old object so an interruption can't
  // leave a broken cover. A re-point failure is swallowed; cleanup still runs.
  if (result.was_cover && opts.onRepointCover) {
    try { await opts.onRepointCover(newPath) } catch { /* cover re-point best-effort */ }
  }

  // The row now points at newPath. Delete the old objects, but never the new
  // one (in the rare exact-same-file case old === new and we must keep it).
  onProgress?.('cleanup')
  await removeObjects(
    [result.old_web_path, result.old_thumb_path, result.old_original_path].filter(
      (p) => p && p !== newPath,
    ),
  )

  onProgress?.('done')
  return { imageId, newPath, filename: file.name, wasCover: !!result.was_cover }
}
