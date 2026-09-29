// Sync <img> src for the async signedStorageUrl(): renders the public URL first,
// then swaps to the signed one. Short-circuits to public URLs while the signed-URL
// flag is off.

import { useEffect, useRef, useState } from 'react'
import { storageUrl } from './supabase'
import { signedStorageUrl } from './signedStorage'

// Public URL on first paint avoids flicker; set false once the bucket goes private.
const INITIAL_USE_PUBLIC = true

const SIGNED_URLS_ENABLED =
  (import.meta.env.VITE_PUBLIC_VIEWER_SIGNED_URLS as string | undefined) === '1'

// SignedImg doesn't use the signed URL for these buckets, and signing ~900 images
// per gallery load saturated the API function.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

export function useSignedSrc(
  bucket: string,
  path: string | null | undefined,
): string {
  const skipSignedFetch = TRANSFORMABLE_BUCKETS.has(bucket)

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

  // Synchronous public URL when signing is skipped, so there's no effect-lag frame.
  if (skipSignedFetch || !SIGNED_URLS_ENABLED) return path ? storageUrl(bucket, path) : ''
  return src
}
