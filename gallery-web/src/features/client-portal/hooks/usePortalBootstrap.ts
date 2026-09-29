import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { isPortalBootstrap, type PortalBootstrap } from '../lib/bootstrap'

/**
 * Loads the signed-in member's memberships. An active membership for the
 * resolved client replaces the legacy PIN gate; no session → `bootstrap` null.
 */
export function usePortalBootstrap() {
  const [bootstrap, setBootstrap] = useState<PortalBootstrap | null>(null)
  const [bootstrapChecked, setBootstrapChecked] = useState(false)
  const [memberEmail, setMemberEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { setBootstrap(null); setBootstrapChecked(true); return }
        setMemberEmail(session.user.email ?? null)
        const { data, error: e } = await supabase.rpc('client_portal_bootstrap')
        if (cancelled) return
        setBootstrap(!e && isPortalBootstrap(data) ? data : null)
      } catch {
        if (!cancelled) setBootstrap(null)
      } finally {
        if (!cancelled) setBootstrapChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { bootstrap, bootstrapChecked, memberEmail }
}
