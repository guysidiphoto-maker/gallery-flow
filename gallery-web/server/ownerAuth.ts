// ownerAuth.ts — server-side auth + tenant-ownership gate for cost/AI endpoints.
//
// WHY: the AI endpoints (score-images, generate-feed, generate-campaign,
// plan-event, generate-captions) each make paid Anthropic calls. Before this
// gate they were protected ONLY by an Origin/Referer allowlist, which (a) is
// trivially spoofable by any HTTP client and (b) was skipped entirely when the
// request carried no Origin/Referer header (e.g. curl / server-to-server). A
// caller who knew (or guessed/leaked) any valid `clientId` UUID could burn the
// platform's ANTHROPIC_API_KEY budget on someone else's data, anonymously.
//
// This module enforces the real boundary: a valid Supabase JWT (Bearer token)
// whose user OWNS the business that owns the resource. It uses the SERVICE-ROLE
// client only to (1) validate the JWT via GoTrue and (2) read ownership rows;
// it never trusts a client-supplied businessId.
//
// Ownership model (migrations 002/005/006): one business per user,
// `businesses.user_id = auth.uid()`. A client belongs to exactly one business.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

export type GateFailure = { ok: false; status: number; code: string }
export type OwnerOk = { ok: true; userId: string; businessId: string }
export type AuthedOk = { ok: true; userId: string }

/** Pull the raw JWT out of `Authorization: Bearer <token>` (case-insensitive). */
export function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization ?? (req.headers as Record<string, string>).Authorization
  if (!raw || typeof raw !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  const token = m?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

/**
 * Verify the request carries a valid Supabase session JWT. Returns the user id.
 * Use for endpoints that consume cost but touch no tenant-scoped resource
 * (e.g. generate-captions, which only transforms free-text the caller passes).
 */
export async function requireAuthedUser(
  req: VercelRequest,
  supabase: SupabaseClient,
): Promise<AuthedOk | GateFailure> {
  const token = getBearerToken(req)
  if (!token) return { ok: false, status: 401, code: 'auth_required' }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { ok: false, status: 401, code: 'invalid_token' }
  return { ok: true, userId: data.user.id }
}

/**
 * Verify the request carries a valid Supabase JWT AND that the authenticated
 * user owns the business that owns `clientId`. Rejects with:
 *   401 auth_required / invalid_token  — missing or bad JWT
 *   404 client_not_found / business_not_found — unknown clientId
 *   403 forbidden — valid user, but the client belongs to a different business
 *
 * MUST be called BEFORE any paid AI call. The returned businessId is the
 * server-verified one — callers should prefer it over any client-supplied value.
 */
export async function requireBusinessOwnerOfClient(
  req: VercelRequest,
  supabase: SupabaseClient,
  clientId: string,
): Promise<OwnerOk | GateFailure> {
  const authed = await requireAuthedUser(req, supabase)
  if (!authed.ok) return authed

  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { ok: false, status: 404, code: 'client_not_found' }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, user_id')
    .eq('id', client.business_id)
    .maybeSingle()
  if (!business) return { ok: false, status: 404, code: 'business_not_found' }

  // The tenant boundary. Service-role bypassed RLS for the lookups above, so we
  // assert ownership explicitly here.
  if (business.user_id !== authed.userId) {
    return { ok: false, status: 403, code: 'forbidden' }
  }

  return { ok: true, userId: authed.userId, businessId: business.id as string }
}
