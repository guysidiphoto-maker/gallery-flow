import { requestGalleryFaceIndex } from '@/shared/data/faceSearch'

// Kick off (idempotent) face indexing for a gallery. Best-effort: already
// indexed images are skipped server-side, and a failure never blocks the caller.
export function requestFaceIndex(galleryId: string): void {
  void requestGalleryFaceIndex(galleryId).catch(err => console.warn('[face-index]', err))
}
