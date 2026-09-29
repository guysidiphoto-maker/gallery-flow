import { createClient } from '@supabase/supabase-js'

// Env overrides let a staging preview point at another project; prod builds use
// the fallbacks. import.meta.env is optional-chained: it's undefined under tsx tests.
const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Supabase on-the-fly resize URL (CDN-cached). No `format=` param: render only
 * accepts `origin` and returns 400 otherwise; Accept-header negotiation suffices.
 */
export function renderUrl(
  bucket: string,
  path: string,
  width: number,
  quality = 60,
): string {
  // resize=contain is required: the default (fill) keeps the source height and distorts.
  return `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${path}?width=${width}&quality=${quality}&resize=contain`
}

// Buckets whose objects Supabase can transform on the fly.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

/**
 * Display URL for a gallery image. Derivatives are served directly because
 * transforms are quota-limited; only originals go through a bounded transform
 * (`width`/`quality` apply to that case only).
 */
export function displayUrl(
  bucket: string,
  path: string,
  width: number,
  quality = 60,
): string {
  if (TRANSFORMABLE_BUCKETS.has(bucket) && path.includes('/originals/')) {
    return renderUrl(bucket, path, width, quality)
  }
  return storageUrl(bucket, path)
}
