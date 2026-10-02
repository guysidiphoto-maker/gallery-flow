// The end-client portal (a photographer's customer viewing all their galleries).
// All reads are RPCs so they work before/without a client login.

import { supabase } from '@/shared/lib/supabase'

/** The signed-in client's memberships (`client_portal_bootstrap`); unauthenticated returns `authenticated: false`. */
export async function getClientPortalBootstrap() {
  return supabase.rpc('client_portal_bootstrap')
}

/** `[{ client_id, ... }]` for a `/{business}/c/{client}` URL. */
export async function resolveClientPortal(businessSlug: string, clientSlug: string) {
  return supabase.rpc('resolve_client_portal', {
    p_business_slug: businessSlug,
    p_client_slug: clientSlug,
  })
}

/** `[{ business_slug, client_slug, ... }]` for a legacy `/client/{id}` URL. */
export async function resolveClientPortalById(clientId: string) {
  return supabase.rpc('resolve_client_portal_by_id', { p_client_id: clientId })
}

/** Whether the client's live galleries carry a legacy PIN (the PIN itself stays server-side). */
export async function clientHasLegacyPin(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('client_has_legacy_pin', { p_client_id: clientId })
  return !error && data === true
}
