// "Find my photos": the `rekognition` edge function compares a selfie with the
// gallery's faces (AWS Rekognition) and returns matching image ids + rows.

import { supabase } from '@/shared/lib/supabase'

/** `{ data: { matches, images } | { error }, error }` for a selfie; pass the unlock token for gated galleries. */
export async function searchFacesBySelfie(galleryId: string, selfie: File | Blob, token: string | null) {
  const form = new FormData()
  form.append('galleryId', galleryId)
  form.append('selfie', selfie)
  if (token) form.append('token', token)
  return supabase.functions.invoke('rekognition', { body: form })
}
