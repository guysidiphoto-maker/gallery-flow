// membership.ts — server-side client-membership authorization gate.
//
// Companion to ownerAuth.ts (owner side) and entitlements.ts. This resolves the
// CLIENT side: is the JWT holder an ACTIVE member of a given client? Access is
// always re-checked against `status = 'active'`, so a disabled/revoked member
// loses access immediately on the next request regardless of session liveness.
//
// Requires a SERVICE-ROLE Supabase client (it reads membership rows that RLS
// would otherwise scope). It never trusts a browser-supplied business_id.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuthedUser, type GateFailure } from './ownerAuth.js'

export type MembershipRole = 'client_admin' | 'approver' | 'viewer'
export type MembershipOk = {
  ok: true
  userId: string
  membershipId: string
  clientId: string
  businessId: string
  role: MembershipRole
}

/**
 * Require the request's JWT holder to be an ACTIVE member of `clientId`.
 * Rejects with:
 *   401 auth_required / invalid_token — missing/bad JWT
 *   403 no_active_membership          — valid user, but not an active member
 * The returned businessId/clientId are the server-verified values.
 */
export async function requireActiveMembership(
  req: VercelRequest,
  supabase: SupabaseClient,
  clientId: string,
): Promise<MembershipOk | GateFailure> {
  const authed = await requireAuthedUser(req, supabase)
  if (!authed.ok) return authed

  const { data: m } = await supabase
    .from('client_memberships')
    .select('id, client_id, business_id, role, status, auth_user_id')
    .eq('client_id', clientId)
    .eq('auth_user_id', authed.userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!m) return { ok: false, status: 403, code: 'no_active_membership' }

  return {
    ok: true,
    userId: authed.userId,
    membershipId: m.id as string,
    clientId: m.client_id as string,
    businessId: m.business_id as string,
    role: m.role as MembershipRole,
  }
}

/**
 * List the caller's active memberships (server-side helper for portal bootstrap
 * fallbacks / owner impersonation-free preview). Self-scoped by auth.uid().
 */
export async function resolveActiveMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ membershipId: string; clientId: string; businessId: string; role: MembershipRole }>> {
  if (!userId) return []
  const { data } = await supabase
    .from('client_memberships')
    .select('id, client_id, business_id, role, status')
    .eq('auth_user_id', userId)
    .eq('status', 'active')
  return (data ?? []).map((m) => ({
    membershipId: m.id as string,
    clientId: m.client_id as string,
    businessId: m.business_id as string,
    role: m.role as MembershipRole,
  }))
}
