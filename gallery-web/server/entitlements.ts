// entitlements.ts — server-side Production Suite entitlement gate.
//
// The ONE canonical way the server decides whether a business may use the
// advanced (Production) modules. Frontend flags only render navigation; every
// Production API/route re-checks here. Default is DENY.
//
// Source of truth: the `has_business_entitlement(business_id, capability)` RPC
// (migration 089), which is service_role-only — so this module MUST be given a
// service-role Supabase client. It never trusts a browser-supplied entitlement.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuthedUser, requireBusinessOwnerOfClient, type GateFailure, type OwnerOk } from './ownerAuth.js'

export const PRODUCTION_SUITE = 'production_suite' as const

export type EntitlementOk = { ok: true; userId: string; businessId: string; capability: string }

/**
 * Pure resolver: does `businessId` hold an active, unexpired `capability`?
 * Fails CLOSED — any error (RPC error, null) → false. The caller is responsible
 * for having already authorized that the requester is scoped to `businessId`.
 */
export async function resolveEntitlement(
  supabase: SupabaseClient,
  businessId: string,
  capability: string,
): Promise<boolean> {
  if (!businessId) return false
  const { data, error } = await supabase.rpc('has_business_entitlement', {
    p_business_id: businessId,
    p_capability: capability,
  })
  if (error) return false
  return data === true
}

/**
 * Full gate for OWNER-side Production endpoints: valid JWT + the user owns
 * `businessId` + the business holds `capability`. Returns 401/403 on failure.
 * `businessId` here is the caller-supplied target; ownership is asserted against
 * `businesses.user_id = auth.uid()` using the service-role client.
 */
export async function requireOwnerEntitlement(
  req: VercelRequest,
  supabase: SupabaseClient,
  businessId: string,
  capability: string,
): Promise<EntitlementOk | GateFailure> {
  const authed = await requireAuthedUser(req, supabase)
  if (!authed.ok) return authed

  const { data: business } = await supabase
    .from('businesses')
    .select('id, user_id')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) return { ok: false, status: 404, code: 'business_not_found' }
  if (business.user_id !== authed.userId) return { ok: false, status: 403, code: 'forbidden' }

  const entitled = await resolveEntitlement(supabase, businessId, capability)
  if (!entitled) return { ok: false, status: 403, code: 'entitlement_required' }

  return { ok: true, userId: authed.userId, businessId, capability }
}

/**
 * Gate for entitlement where the business has ALREADY been resolved+authorized
 * by an upstream check (e.g. an active client membership resolved the business).
 * Verifies only that the JWT is valid and the (already-scoped) business holds the
 * capability. Use when the requester is a client member, not the owner.
 */
export async function requireResolvedEntitlement(
  req: VercelRequest,
  supabase: SupabaseClient,
  businessId: string,
  capability: string,
): Promise<EntitlementOk | GateFailure> {
  const authed = await requireAuthedUser(req, supabase)
  if (!authed.ok) return authed
  const entitled = await resolveEntitlement(supabase, businessId, capability)
  if (!entitled) return { ok: false, status: 403, code: 'entitlement_required' }
  return { ok: true, userId: authed.userId, businessId, capability }
}

/**
 * Drop-in replacement for `requireBusinessOwnerOfClient` on Production-only
 * endpoints (generate-feed/campaign/plan-event/score-images). Verifies JWT +
 * business ownership of the client AND that the business holds `capability`
 * (default `production_suite`). Returns the SAME `OwnerOk` shape so call sites
 * that read `gate.businessId` / `gate.userId` are unchanged. Adds a 403
 * `entitlement_required` when the business is not entitled (default deny).
 */
export async function requireProductionOwnerOfClient(
  req: VercelRequest,
  supabase: SupabaseClient,
  clientId: string,
  capability: string = PRODUCTION_SUITE,
): Promise<OwnerOk | GateFailure> {
  const owner = await requireBusinessOwnerOfClient(req, supabase, clientId)
  if (!owner.ok) return owner
  const entitled = await resolveEntitlement(supabase, owner.businessId, capability)
  if (!entitled) return { ok: false, status: 403, code: 'entitlement_required' }
  return owner
}
