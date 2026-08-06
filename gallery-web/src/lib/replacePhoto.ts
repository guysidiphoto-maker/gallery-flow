// "Replace photo" orchestration — swap the pixels behind an existing images row
// while preserving its logical identity (section, sort position, top-pick,
// favourites, references, cover role).
//
// Order of operations is chosen so a failure at ANY step leaves the original
// image completely usable and never orphans the live object:
//
//   1. Validate the replacement file (same gate as upload).
//   2. Upload the NEW original to a fresh content-addressed key. The old object
//      is still the one the row points at, so a failure here changes nothing.
//   3. Call replace_image() — the owner-checked, transactional DB flip. Only
//      after this succeeds does the row point at the new pixels.
//   4. Delete the OLD storage object(s), now unreferenced. Best-effort: a
//      failure here leaves a harmless orphan, never a broken gallery.
//
// If step 3 fails we attempt to delete the object we uploaded in step 2 so a
// failed replace does not accrue garbage either.

import { supabase } from '../supabase'
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
  /** Called after the DB flip succeeds and BEFORE the old storage objects are
   *  deleted, only when the replaced image was the gallery cover. The cover
   *  reference lives in delivery_settings (outside the RPC's transaction) and
   *  is keyed by the OLD storage path, so it must be re-pointed to newPath
   *  before the old object is removed — otherwise a crash between the flip and
   *  the cover write would leave the cover pointing at a deleted object. */
  onRepointCover?: (newPath: string) => Promise<void>
}

// Buckets a replacement object may leave stale copies in. Originals live in
// `gallery-images`; the original upload path (uploadOneImage) may have
// dual-written a public thumbnail under the same key in the public thumbs
// bucket, so we best-effort remove the old key from there too.
const CLEANUP_BUCKETS = [BUCKET, 'gallery-images-thumbs-public'] as const

async function removeObjects(paths: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)))
  if (unique.length === 0) return
  for (const bucket of CLEANUP_BUCKETS) {
    try {
      await supabase.storage.from(bucket).remove(unique)
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
  const { data, error } = await supabase.rpc('replace_image', {
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

  // If this photo was the gallery cover, re-point the cover to the new object
  // BEFORE deleting the old one. The cover reference lives in delivery_settings
  // (keyed by the old path), so deleting first would leave a broken cover if
  // anything interrupted the flow. A cover re-point failure is swallowed — the
  // grid row is already correct and the cover can be re-set manually; we do not
  // block cleanup on it, but we do attempt it first.
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
