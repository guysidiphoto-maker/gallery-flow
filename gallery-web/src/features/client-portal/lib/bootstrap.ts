import { getBusinessSlug } from '@/shared/data/businesses'
import { getClientPortalBootstrap } from '@/shared/data/clientPortal'

export interface PortalMembership {
  membership_id: string
  client_id: string
  business_id: string
  client_name: string
  client_slug: string | null
  role: string
  production_suite: boolean
}

/** Shape of the self-scoped `client_portal_bootstrap` RPC (takes no args). */
export interface PortalBootstrap {
  authenticated: boolean
  memberships: PortalMembership[]
  galleries: Array<Record<string, unknown>>
}

export function isPortalBootstrap(v: unknown): v is PortalBootstrap {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.authenticated === 'boolean'
    && Array.isArray(o.memberships) && Array.isArray(o.galleries)
}

function hasMemberships(v: unknown): v is Pick<PortalBootstrap, 'authenticated' | 'memberships'> {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.authenticated === 'boolean' && Array.isArray(o.memberships)
}

/**
 * Dashboard URL for the member's first active membership: the short slug form
 * when both slugs are known, else the legacy UUID form.
 */
export async function resolveDashboardUrl(): Promise<string | null> {
  const { data, error } = await getClientPortalBootstrap()
  if (error || !hasMemberships(data)) return null
  if (!data.authenticated || data.memberships.length === 0) return null
  const m = data.memberships[0]
  if (m.client_slug) {
    // The bootstrap payload doesn't carry the business slug.
    const { data: biz } = await getBusinessSlug(m.business_id)
    const bizSlug = (biz?.slug as string | undefined) ?? null
    if (bizSlug) return `/${bizSlug}/c/${m.client_slug}`
  }
  return `/client/${m.client_id}/dashboard`
}
