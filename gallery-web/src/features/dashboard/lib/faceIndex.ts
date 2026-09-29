import { supabase } from '@/shared/lib/supabase'

// Kick off (idempotent) face indexing for a gallery. Best-effort: already
// indexed images are skipped server-side, and a failure never blocks the caller.
export function requestFaceIndex(galleryId: string): void {
  void supabase.functions.invoke('rekognition', {
    body: { action: 'index_gallery', galleryId },
  }).catch(err => console.warn('[face-index]', err))
}
