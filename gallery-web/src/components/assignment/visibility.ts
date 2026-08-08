// visibility.ts — pure logic for the "no client can currently see this
// gallery" indicator (sprint contract C3). Kept free of React/browser imports
// so it is provable offline (tests/assignment.test.ts runs it under tsx).
//
// A gallery is visible in the client portal ONLY when ALL of these hold:
//   1. it is assigned to a client (galleries.client_id set)
//   2. it is published (status === 'live') — the portal bootstrap only returns
//      live galleries
//   3. the assigned client has at least one ACTIVE member (someone who can
//      actually log in; cpv2_owner_clients_overview exposes active_member_count)

export type VisibilityReason = 'unassigned' | 'not_published' | 'no_active_members'

export interface VisibilityGallery {
  client_id: string | null
  status: string
}

/**
 * Returns the FIRST reason no client can currently see the gallery, or null
 * when it is visible (or when visibility cannot be disproven).
 *
 * `clientActiveMembers` is the assigned client's active member count. When it
 * is unknown (undefined/null, e.g. the clients overview has not loaded yet) we
 * do NOT speculate: only an explicit 0 triggers the member-based indicator.
 */
export function computeVisibilityIndicator(
  gallery: VisibilityGallery,
  clientActiveMembers?: number | null,
): VisibilityReason | null {
  if (!gallery.client_id) return 'unassigned'
  if (gallery.status !== 'live') return 'not_published'
  if (typeof clientActiveMembers === 'number' && clientActiveMembers <= 0) return 'no_active_members'
  return null
}
