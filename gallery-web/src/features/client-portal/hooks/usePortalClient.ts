import { useEffect, useState } from 'react'
import { resolveClientPortal, resolveClientPortalById } from '@/shared/data/clientPortal'
import { parsePortalPath } from '../lib/parsePortalPath'

/**
 * Resolves the portal URL to a client UUID. Short slug URLs go through the
 * membership-gated `resolve_client_portal` RPC (non-members get no rows);
 * legacy UUID URLs are rewritten in place to the short form once resolved.
 */
export function usePortalClient() {
  // Re-parsed every render on purpose: after the replaceState rewrite the slug
  // reflects the canonical URL.
  const parsedUrl = parsePortalPath(window.location.pathname)
  const [clientId, setClientId] = useState<string>(parsedUrl.clientId)
  const [resolveErr, setResolveErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (clientId) {
      ;(async () => {
        const { data, error: e } = await resolveClientPortalById(clientId)
        if (cancelled || e) return
        const row = Array.isArray(data) ? data[0] : null
        if (!row?.business_slug || !row?.client_slug) return
        const newUrl = `/${row.business_slug}/c/${row.client_slug}`
        if (window.location.pathname !== newUrl) {
          window.history.replaceState(null, '', newUrl + window.location.search + window.location.hash)
        }
      })()
      return () => { cancelled = true }
    }
    if (!parsedUrl.slug || !parsedUrl.clientSlug) return
    ;(async () => {
      const { data, error: e } = await resolveClientPortal(parsedUrl.slug, parsedUrl.clientSlug)
      if (cancelled) return
      const row = !e && Array.isArray(data) ? data[0] : null
      if (!row?.client_id) { setResolveErr('Business not found'); return }
      setClientId(row.client_id)
    })()
    return () => { cancelled = true }
  }, [parsedUrl.slug, parsedUrl.clientSlug, clientId])

  return { slug: parsedUrl.slug, clientId, resolveErr }
}
