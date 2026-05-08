// publicSession.ts — Phase 4.5.C
//
// Anonymous gallery viewer session. Lives parallel to (NOT mixed with)
// Phase 3's client-token-* session keys, which authenticate PIN-protected
// dashboards. This one authenticates anyone who opens /<biz>/<gallery>
// from a WhatsApp/Slack link — they have no PIN and no login.
//
// Token: 43-char base64url, gallery-scoped, IP-bound, 60-min TTL. Issued
// by /api/append-event-posts action=public_gallery_session. Cached in
// sessionStorage (tab-scoped, dies on tab close).
//
// Refresh strategy: callers should re-call ensurePublicSession before each
// risky operation. The endpoint is idempotent (same-IP same-gallery alive
// token is reused). A passive 50-minute interval refresh keeps the cache
// warm; mid-scroll expiry is handled lazily by signedStorage.ts which
// re-issues if the cache returns nothing.
//
// Feature flag: this whole module no-ops if VITE_PUBLIC_VIEWER_SIGNED_URLS
// is not '1'. Until then ensurePublicSession returns null and signedStorage
// behaves exactly as today (Phase 4.4 behavior).

const STORAGE_KEY = (galleryId: string) => `pixflow-public-token-${galleryId}`
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000
const ENABLED = (import.meta.env.VITE_PUBLIC_VIEWER_SIGNED_URLS as string | undefined) === '1'

interface CachedSession {
  token: string
  expiresAt: number
  galleryId: string
}

interface IssueSuccess {
  ok: true
  token: string
  expires_at: string
}
interface IssueRateLimit {
  ok: false
  error: 'turnstile_required' | 'hard_limit_exceeded' | 'rate_limited'
  retry_after_seconds?: number
  turnstile_site_key?: string | null
}
interface IssueRejection {
  ok: false
  error: 'gallery_not_live' | 'invalid_payload' | 'origin_not_allowed' | 'issue_failed' | string
  detail?: string
}
type IssueResponse = IssueSuccess | IssueRateLimit | IssueRejection

interface EnsureResult {
  /** Token if we have one (cached or freshly issued). null on hard failure. */
  token: string | null
  /** When the server told us to retry past Turnstile. The caller renders the
   *  Turnstile widget and re-calls ensurePublicSession with `turnstileToken`. */
  needsTurnstile?: { siteKey: string | null; retryAfterSeconds: number }
  /** Set when the gallery is not live; caller should route to a 404 view. */
  notLive?: boolean
}

const inflight = new Map<string, Promise<EnsureResult>>()

function readCache(galleryId: string): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(galleryId))
    if (!raw) return null
    const cached: CachedSession = JSON.parse(raw)
    if (cached.galleryId !== galleryId) return null
    if (cached.expiresAt - Date.now() < REFRESH_BEFORE_EXPIRY_MS) return null
    return cached.token
  } catch {
    return null
  }
}

function writeCache(galleryId: string, token: string, expiresAt: number): void {
  try {
    const cached: CachedSession = { token, expiresAt, galleryId }
    sessionStorage.setItem(STORAGE_KEY(galleryId), JSON.stringify(cached))
  } catch { /* sessionStorage full or disabled — ignore */ }
}

function clearCache(galleryId: string): void {
  try { sessionStorage.removeItem(STORAGE_KEY(galleryId)) } catch { /* ignore */ }
}

export async function ensurePublicSession(
  galleryId: string,
  opts?: { turnstileToken?: string; bypassCache?: boolean },
): Promise<EnsureResult> {
  if (!ENABLED) return { token: null }
  if (!galleryId) return { token: null }

  const turnstileToken = opts?.turnstileToken ?? ''

  if (!opts?.bypassCache && !turnstileToken) {
    const cached = readCache(galleryId)
    if (cached) return { token: cached }
  }

  // De-dupe parallel calls for the same gallery.
  const inflightKey = `${galleryId}::${turnstileToken || 'no-tt'}`
  const flying = inflight.get(inflightKey)
  if (flying) return flying

  const fetchPromise = (async (): Promise<EnsureResult> => {
    try {
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'public_gallery_session',
          galleryId,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      })
      const j = (await res.json()) as IssueResponse
      if (j.ok && j.token) {
        const expiresAt = new Date(j.expires_at).getTime()
        writeCache(galleryId, j.token, expiresAt)
        return { token: j.token }
      }
      if (!j.ok) {
        if (j.error === 'gallery_not_live') {
          clearCache(galleryId)
          return { token: null, notLive: true }
        }
        if (j.error === 'turnstile_required' || j.error === 'rate_limited') {
          return {
            token: null,
            needsTurnstile: {
              siteKey: ('turnstile_site_key' in j ? j.turnstile_site_key : null) ?? null,
              retryAfterSeconds: ('retry_after_seconds' in j ? j.retry_after_seconds : 60) ?? 60,
            },
          }
        }
      }
      return { token: null }
    } catch {
      return { token: null }
    } finally {
      inflight.delete(inflightKey)
    }
  })()

  inflight.set(inflightKey, fetchPromise)
  return fetchPromise
}

export function readPublicSessionToken(galleryId: string): string | null {
  if (!ENABLED) return null
  return readCache(galleryId)
}

export function clearPublicSession(galleryId: string): void {
  clearCache(galleryId)
}

export function isPublicViewerSignedUrlsEnabled(): boolean {
  return ENABLED
}
