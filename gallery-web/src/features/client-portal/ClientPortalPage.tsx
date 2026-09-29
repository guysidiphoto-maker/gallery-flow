import { PageLoader } from '@/shared/ui'
import { usePortalLocale } from '@/shared/i18n/portalLocale'
import { usePortalClient } from './hooks/usePortalClient'
import { usePortalBootstrap } from './hooks/usePortalBootstrap'
import { useLegacySession } from './hooks/useLegacySession'
import { usePortalGalleries } from './hooks/usePortalGalleries'
import { ErrorScreen } from './components/ErrorScreen'
import { PinGate } from './components/PinGate'
import { RestrictedGate } from './components/RestrictedGate'
import { PortalContent } from './components/PortalContent'

/**
 * Client portal. Access is granted by an active membership (server-verified via
 * client_portal_bootstrap) or, for un-upgraded clients, the legacy PIN session.
 */
export function ClientDashboard() {
  const { slug, clientId, resolveErr } = usePortalClient()
  const { authenticated, markAuthenticated } = useLegacySession(clientId)
  const { bootstrap, bootstrapChecked, memberEmail } = usePortalBootstrap()
  const { galleries, covers, clientCode, error, loading } = usePortalGalleries(clientId, resolveErr)
  const loc = usePortalLocale()

  // Bootstrap is self-scoped via auth.uid(); the route param is never trusted.
  const activeMembership =
    clientId && bootstrap?.authenticated
      ? bootstrap.memberships.find(m => m.client_id === clientId) ?? null
      : null
  const memberAuthorized = activeMembership !== null

  // Wait for the membership check so a valid member never flashes the PIN gate.
  if ((!bootstrapChecked && !authenticated) || loading) {
    return <PageLoader dir={loc.dir} label={loc.t('loading')} />
  }
  if (error) return <ErrorScreen loc={loc} message={error} />

  if (!authenticated && !memberAuthorized) {
    // A missing PIN must fail closed, never render the portal open.
    return clientCode
      ? <PinGate clientId={clientId} clientCode={clientCode} slug={slug} onUnlocked={markAuthenticated} />
      : <RestrictedGate loc={loc} />
  }

  return (
    <PortalContent
      loc={loc}
      slug={slug}
      clientId={clientId}
      galleries={galleries}
      covers={covers}
      membership={activeMembership}
      memberEmail={memberEmail}
    />
  )
}
