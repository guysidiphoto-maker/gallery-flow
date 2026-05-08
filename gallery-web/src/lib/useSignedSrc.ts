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

import { useEffect, useRef, useState } from 'react'
import { storageUrl } from '../supabase'
import { signedStorageUrl } from './signedStorage'

/**
 * While the bucket is still public, render with the public URL on first paint
 * for zero flicker. Flip to `false` as part of Phase 4.5 to ensure no public
 * URL is ever sent to the browser after the bucket goes private.
 */
const INITIAL_USE_PUBLIC = true

export function useSignedSrc(
  bucket: string,
  path: string | null | undefined,
): string {
  const initial = path && INITIAL_USE_PUBLIC ? storageUrl(bucket, path) : ''
  const [src, setSrc] = useState<string>(initial)
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
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

  return src
}
