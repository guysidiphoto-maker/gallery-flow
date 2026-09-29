// Pure logic for the "no client can see this gallery" indicator; kept free of
// React/browser imports so tests/assignment.test.ts can run it under tsx.
// Visible only when assigned, published (live) and the client has an active member.

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
