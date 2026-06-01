// useSignedSrc — Phase 4.4 React glue around signedStorageUrl().
//
// Why: <img src=...> needs a sync string. signedStorageUrl is async. This
// hook bridges the two: render with the public URL immediately (zero flash,
// since the bucket is still public:true today), then quietly swap to the
// signed URL once it resolves. After the bucket flips private (Phase 4.5),
// the public URL will 401 — at which point this hook's initial-render
// strategy needs to flip to "empty placeholder, then signed URL". A single
// constant `INITIAL_USE_PUBLIC` controls that transition; flipping it is a
// 1-line, repo-wide cutover.
//
// Cache: signedStorageUrl already de-dupes in-flight requests and caches
// resolved URLs for 55 minutes, so calling this hook in many places at once
// triggers exactly one network request per (bucket, path) pair per session.
//
// P4.5.D: when VITE_PUBLIC_VIEWER_SIGNED_URLS is not '1', short-circuit to
// the public URL and skip the signed-URL roundtrip entirely. Pre-flip this
// avoids ~200 needless signed_url requests per gallery load, while keeping
// every callsite already wired to <SignedImg> safe.

import { useEffect, useRef, useState } from 'react'
import { storageUrl } from '../supabase'
import { signedStorageUrl } from './signedStorage'

/**
 * While the bucket is still public, render with the public URL on first paint
 * for zero flicker. Flip to `false` as part of Phase 4.5 to ensure no public
 * URL is ever sent to the browser after the bucket goes private.
 */
const INITIAL_USE_PUBLIC = true

const SIGNED_URLS_ENABLED =
  (import.meta.env.VITE_PUBLIC_VIEWER_SIGNED_URLS as string | undefined) === '1'

// Buckets where the consumer (<SignedImg>) renders a /render/image/public/...
// transform URL anyway — the signed `baseSrc` is unused. Hitting
// /api/append-event-posts?action=signed_url 900× on gallery load saturated the
// Vercel function and surfaced as 500s in production. Skip the roundtrip for
// these buckets.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

export function useSignedSrc(
  bucket: string,
  path: string | null | undefined,
): string {
  const skipSignedFetch = TRANSFORMABLE_BUCKETS.has(bucket)

  // Hooks must be called unconditionally (rules of hooks), so we always
  // declare state + effect; the flag only changes what they do.
  const initial = path && INITIAL_USE_PUBLIC ? storageUrl(bucket, path) : ''
  const [src, setSrc] = useState<string>(initial)
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    if (skipSignedFetch || !SIGNED_URLS_ENABLED) {
      setSrc(path ? storageUrl(bucket, path) : '')
      return
    }
    if (!path) {
      setSrc('')
      lastKeyRef.current = ''
      return
    }
    const key = `${bucket}::${path}`
    if (key === lastKeyRef.current && src) return
    lastKeyRef.current = key

    let cancelled = false
    signedStorageUrl(bucket, path)
      .then(url => { if (!cancelled) setSrc(url) })
      .catch(() => {
        if (!cancelled) setSrc(storageUrl(bucket, path))
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run on key change
  }, [bucket, path])

  // When flag is off OR the caller doesn't need the signed URL, return the
  // public URL synchronously (no waiting for useEffect). Otherwise return
  // whatever state holds (public initially, signed after resolve).
  if (skipSignedFetch || !SIGNED_URLS_ENABLED) return path ? storageUrl(bucket, path) : ''
  return src
}
