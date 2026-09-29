import { useEffect, useState } from 'react'
import { clearLegacySession, dashKey, tokenExpiresKey } from '../lib/legacySession'

/** Cached legacy-PIN auth flag for this tab; dropped once the server token expires. */
export function useLegacySession(clientId: string) {
  // Read once with the clientId known at mount (empty for short slug URLs).
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(dashKey(clientId)) === 'true')

  useEffect(() => {
    if (!clientId) return
    try {
      const expRaw = sessionStorage.getItem(tokenExpiresKey(clientId))
      if (expRaw) {
        // TIMESTAMPTZ arrives as an ISO string; Date also accepts numeric ms.
        const expMs = new Date(expRaw).getTime()
        if (Number.isFinite(expMs) && expMs < Date.now()) {
          clearLegacySession(clientId)
          setAuthenticated(false)
        }
      }
    } catch { /* ignore */ }
  }, [clientId])

  return { authenticated, markAuthenticated: () => setAuthenticated(true) }
}
