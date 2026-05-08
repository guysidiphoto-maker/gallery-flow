// signedStorage.ts — Phase 4 prep. Not yet wired into any callsite.
//
// Today, every <img src={storageUrl(bucket, path)} /> uses a permanent public
// URL because the bucket is public. Phase 4 will flip the bucket private;
// this helper is the swap-in replacement that requests a short-lived signed
// URL from /api/append-event-posts (action='signed_url') and falls back to
// the public URL if the request fails.

import { storageUrl } from '../supabase'

interface CacheEntry { url: string; expiresAt: number }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string>>()
const CACHE_TTL_MS = 55 * 60 * 1000   // 55min, signed URLs last 60min server-side

function readSessionToken(): string {
  // Read whatever Phase 3 stored. We don't know the clientId here, but the
  // server endpoint can resolve it from the token. The frontend caller may
  // pass in a token explicitly via `options.token` for surfaces that already
  // know it (e.g., FeedStudio).
  try {
    // Best-effort: scan sessionStorage for any client-token-* key.
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('client-token-')) {
        return sessionStorage.getItem(k) ?? ''
      }
    }
  } catch { /* ignore */ }
  return ''
}

interface SignedStorageOptions {
  /** Override session token (e.g., when caller already has it). */
  token?: string
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
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Client-Session': token } : {}),
        },
        body: JSON.stringify({ action: 'signed_url', bucket, path }),
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
