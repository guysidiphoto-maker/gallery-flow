import { useCallback, useEffect, useState } from 'react'
import { ensurePublicSession, isPublicViewerSignedUrlsEnabled } from '@/shared/lib/publicSession'

const REFRESH_MS = 50 * 60 * 1000

/**
 * Fire-and-forget public-viewer token so signed URLs are ready before first use
 * (no-op unless the signed-URL flag is on). Surfaces a Turnstile site key on 429.
 */
export function usePublicSession(galleryId: string | undefined) {
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)

  useEffect(() => {
    if (!galleryId) return
    if (!isPublicViewerSignedUrlsEnabled()) return
    let cancelled = false
    ;(async () => {
      const r = await ensurePublicSession(galleryId)
      if (cancelled) return
      // The gallery stays rendered; later signed_url calls fall back to public.
      if (r.notLive) console.warn('[publicSession] gallery_not_live')
      if (r.needsTurnstile) setTurnstileSiteKey(r.needsTurnstile.siteKey)
    })()
    const iv = setInterval(() => {
      ensurePublicSession(galleryId, { bypassCache: true }).catch(() => { /* silent */ })
    }, REFRESH_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [galleryId])

  const onTurnstileToken = useCallback(async (token: string) => {
    if (!galleryId) return
    const r = await ensurePublicSession(galleryId, { turnstileToken: token, bypassCache: true })
    if (r.token) setTurnstileSiteKey(null)
  }, [galleryId])

  return { turnstileSiteKey, onTurnstileToken }
}
