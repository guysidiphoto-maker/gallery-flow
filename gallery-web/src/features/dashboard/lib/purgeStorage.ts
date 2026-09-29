import { fetchAllGalleryImages } from '@/shared/data/images'
import { removeStorageObjects } from '@/shared/data/storage'
import { IMAGE_COLUMNS_WITH_ORIGINAL, type GalleryImage } from '../types'

// storage.remove() accepts ~1000 paths; 500 leaves headroom for URL limits.
const CHUNK = 500

async function purgeBucket(bucket: string, all: string[]) {
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK)
    try {
      const { error } = await removeStorageObjects(bucket, chunk)
      if (error) {
        console.warn('[purgeStorageForImages] chunk remove failed', {
          bucket, chunkSize: chunk.length, error: error.message,
        })
      }
    } catch (e) {
      console.warn('[purgeStorageForImages] chunk remove threw', {
        bucket, chunkSize: chunk.length,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

// Best-effort cleanup of the storage objects behind already-deleted image rows.
// The row delete is canonical; this never blocks the UI, failures only log.
// Thumbnails are also mirrored to the public thumbs bucket, so wipe both.
export async function purgeStorageForImages(images: GalleryImage[]) {
  const paths = new Set<string>()
  const thumbPaths = new Set<string>()
  for (const img of images) {
    if (img.storage_path) paths.add(img.storage_path)
    if (img.thumbnail_path) {
      paths.add(img.thumbnail_path)
      thumbPaths.add(img.thumbnail_path)
    }
    if (img.original_path) paths.add(img.original_path)
  }
  if (paths.size === 0 && thumbPaths.size === 0) return
  await Promise.all([
    purgeBucket('gallery-images', Array.from(paths)),
    purgeBucket('gallery-images-thumbs-public', Array.from(thumbPaths)),
  ])
}

// Whole-gallery delete: list every image (paginated past the 1000-row cap) before
// the row delete cascades them away; purge only once that delete succeeded.
export async function listGalleryImagesForPurge(galleryId: string): Promise<GalleryImage[]> {
  try {
    return await fetchAllGalleryImages<GalleryImage>(galleryId, IMAGE_COLUMNS_WITH_ORIGINAL)
  } catch (error) {
    console.warn('[purgeStorageForGallery] could not list images', error)
    return []
  }
}
