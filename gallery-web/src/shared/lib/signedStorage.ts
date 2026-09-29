// Short-lived signed URLs from /api/gallery-access, falling back to the public
// URL on failure. Sends the client session / public-viewer token so the server
// can check the path's gallery scope.

import { storageUrl } from './supabase'

interface CacheEntry { url: string; expiresAt: number }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string>>()
const CACHE_TTL_MS = 55 * 60 * 1000   // 55min, signed URLs last 60min server-side

// Flag off: public URLs directly, avoiding hundreds of signing roundtrips per render.
const SIGNED_URLS_ENABLED =
  (import.meta.env.VITE_PUBLIC_VIEWER_SIGNED_URLS as string | undefined) === '1'

function readSessionToken(): string {
  // Any client-token-* works: the server resolves the client from the token.
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('client-token-')) {
        return sessionStorage.getItem(k) ?? ''
      }
    }
  } catch { /* ignore */ }
  return ''
}

// The helper is path-based and doesn't know the gallery, so send any cached
// viewer token; the server rejects a wrong-scope token and we fall back.
function readPublicViewerToken(): string {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('pixflow-public-token-')) {
        const raw = sessionStorage.getItem(k)
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number }
          if (parsed.token && (parsed.expiresAt ?? 0) > Date.now()) return parsed.token
        } catch { /* corrupt entry, skip */ }
      }
    }
  } catch { /* ignore */ }
  return ''
}

interface SignedStorageOptions {
  /** Client session token override. */
  token?: string
  /** Public-viewer token override. */
  pvt?: string
  /** Required for /originals/ paths of password-protected galleries. */
  unlockToken?: string
  /** Skip cache (force fresh signed URL). */
  bypassCache?: boolean
  /** When the signed URL request fails, fall back to public URL. Default true. */
  fallbackToPublic?: boolean
}

export async function signedStorageUrl(
  bucket: string,
  path: string,
  options: SignedStorageOptions = {},
): Promise<string> {
  if (!SIGNED_URLS_ENABLED) return storageUrl(bucket, path)

  const key = `${bucket}::${path}`
  const now = Date.now()

  if (!options.bypassCache) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > now + 5_000) return hit.url
  }

  // De-dupe parallel requests for the same key.
  const flying = inflight.get(key)
  if (flying) return flying

  const fetchPromise = (async () => {
    try {
      const token = options.token ?? readSessionToken()
      const pvt = options.pvt ?? readPublicViewerToken()
      const unlockToken = options.unlockToken
      const res = await fetch('/api/gallery-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Client-Session': token } : {}),
        },
        body: JSON.stringify({
          action: 'signed_url',
          bucket,
          path,
          ...(pvt ? { pvt } : {}),
          ...(unlockToken ? { unlockToken } : {}),
        }),
      })
      const json = await res.json()
      if (res.ok && json.ok && json.url) {
        cache.set(key, { url: json.url, expiresAt: now + CACHE_TTL_MS })
        return json.url as string
      }
      if (options.fallbackToPublic === false) {
        throw new Error(json?.error ?? `http_${res.status}`)
      }
      return storageUrl(bucket, path)
    } catch (err) {
      if (options.fallbackToPublic === false) throw err
      return storageUrl(bucket, path)
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, fetchPromise)
  return fetchPromise
}

export function clearSignedUrlCache(): void {
  cache.clear()
}

/**
 * /api/watermark URL for full-resolution downloads of watermarked galleries.
 * Download paths only; browsing surfaces keep using signedStorageUrl().
 */
export function signedWatermarkedUrl(
  path: string,
  businessId: string,
  pvt?: string,
  unlockToken?: string,
): string {
  const token = (pvt ?? readPublicViewerToken()).trim()
  const params = new URLSearchParams({ image: path, business: businessId })
  if (token) params.set('pvt', token)
  if (unlockToken) params.set('unlock', unlockToken)
  return `/api/watermark?${params.toString()}`
}
