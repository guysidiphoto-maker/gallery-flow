import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Supabase on-the-fly image transform URL (resized + re-encoded). Result is
 * served by the Smart CDN with a 1-year cache, so each (image,width) pair is
 * transformed once and then served from the edge. Used to emit a responsive
 * <img srcset> so phones download ~16KB instead of the ~74KB stored thumb.
 */
export function renderUrl(
  bucket: string,
  path: string,
  width: number,
  quality = 60,
): string {
  // resize=contain is REQUIRED: with the default (fill) and only a width,
  // Supabase keeps the source HEIGHT — a 1600×1068 photo came back 640×1068
  // (distorted/squarish). `contain` scales proportionally to the width,
  // preserving the real aspect ratio (→ 640×427).
  return `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${path}?width=${width}&quality=${quality}&resize=contain`
}
