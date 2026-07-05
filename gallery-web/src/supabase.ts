import { createClient } from '@supabase/supabase-js'

// P2.2: env-driven with a fallback to the production project. When
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset (the normal prod build)
// these resolve to the exact hardcoded prod values below — byte-identical to
// before. A staging preview sets the two VITE_ vars to point the whole client
// (auth + storage URLs + render URLs) at pixflow-staging, fully isolated from
// production.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Supabase on-the-fly image transform URL (resized + re-encoded). Result is
 * served by the Smart CDN with a 1-year cache, so each (image,width) pair is
 * transformed once and then served from the edge. Used to emit a responsive
 * <img srcset> so phones download ~16KB instead of the ~74KB stored thumb.
 *
 * Format negotiation happens implicitly via the browser's Accept header —
 * passing an explicit `format=` value to Supabase render is currently only
 * supported for `origin` and any other value returns 400 (every image broke
 * when we tried `format=auto`). Modern browsers already advertise AVIF/WebP
 * in Accept, so the CDN can pick the best encoding without us asking.
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

// Buckets whose objects Supabase can transform on the fly.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

/**
 * Display URL for a gallery image. COST CONTROL (2026-07-05): the P2.1 backfill
 * produced static web(≤2048) + thumb(≤640) derivatives for every live image,
 * so a *derivative* path is served DIRECTLY as a plain public object — zero
 * Supabase Storage Image Transformations (the Pro plan includes only 100 origin
 * images/month; routing every viewed image through render/image blew that to
 * 4,091%). We fall back to a bounded on-the-fly render/image transform ONLY for
 * an ORIGINAL path (the handful not yet backfilled / brand-new uploads), so the
 * browser still never pulls the multi-MB original. `width`/`quality` are used
 * only on that transform fallback.
 */
export function displayUrl(
  bucket: string,
  path: string,
  width: number,
  quality = 60,
): string {
  // Transform ONLY an original in a transformable bucket. Everything else —
  // pre-baked derivatives AND non-transformable buckets (stories/video) — is
  // served directly as a plain public object.
  if (TRANSFORMABLE_BUCKETS.has(bucket) && path.includes('/originals/')) {
    return renderUrl(bucket, path, width, quality)
  }
  return storageUrl(bucket, path)
}
