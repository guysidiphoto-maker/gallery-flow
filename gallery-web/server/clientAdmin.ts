// clientAdmin.ts — shared server helpers for the Client Portal V2 owner + portal
// APIs. Pure helpers (validation, invite tokens, hashing) are unit-tested; the
// supabase-taking helpers (owner resolution, audit, rate limit) centralize the
// authorization + safety boundary so no endpoint re-implements it.

import { createHash, randomBytes } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuthedUser, type GateFailure } from './ownerAuth.js'

// ── Pure validation / tokens (offline-testable) ─────────────────────────────

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email)
}

/** sha256 hex — used to hash invite tokens so the raw token never hits the DB. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** Cryptographically random url-safe invite token + its sha256 hash. */
export function genInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: sha256Hex(token) }
}

export const INVITE_TTL_DAYS = 7
export function inviteExpiryISO(nowMs: number = Date.now()): string {
  return new Date(nowMs + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export const ROLES = ['client_admin', 'approver', 'viewer'] as const
export type Role = (typeof ROLES)[number]
export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x)
}

export const SETTABLE_STATUSES = ['active', 'disabled', 'revoked'] as const
export type SettableStatus = (typeof SETTABLE_STATUSES)[number]
export function isSettableStatus(x: unknown): x is SettableStatus {
  return typeof x === 'string' && (SETTABLE_STATUSES as readonly string[]).includes(x)
}

export type AuditAction =
  | 'client_created' | 'invitation_sent' | 'invitation_resent' | 'invitation_accepted'
  | 'invitation_cancelled' | 'membership_disabled' | 'membership_reactivated'
  | 'membership_revoked' | 'gallery_assigned' | 'gallery_unassigned'
  | 'gallery_reassigned' | 'portal_access' | 'password_reset_requested'
  | 'production_access_denied'

// ── Owner resolution (supabase-taking) ──────────────────────────────────────

export type OwnerBusinessOk = { ok: true; userId: string; businessId: string }

/**
 * Resolve the authenticated caller to THEIR business. One business per user
 * (businesses.user_id = auth.uid()). Fails closed: 401 without a valid JWT,
 * 404 if the user has no business. The returned businessId is the ONLY tenant
 * an owner API may act within — never trust a business_id from the body.
 */
export async function requireOwnerBusiness(
  req: VercelRequest,
  supabase: SupabaseClient,
): Promise<OwnerBusinessOk | GateFailure> {
  const authed = await requireAuthedUser(req, supabase)
  if (!authed.ok) return authed
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', authed.userId)
    .maybeSingle()
  if (!biz) return { ok: false, status: 404, code: 'business_not_found' }
  return { ok: true, userId: authed.userId, businessId: biz.id as string }
}

/** Assert a client belongs to businessId (server-verified). */
export async function clientBelongsToBusiness(
  supabase: SupabaseClient,
  clientId: string,
  businessId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('clients').select('id').eq('id', clientId).eq('business_id', businessId).maybeSingle()
  return !!data
}

// ── Audit + rate limit (reuse client_access_audit as the ledger) ────────────

export async function appendAudit(
  supabase: SupabaseClient,
  args: {
    businessId: string; clientId?: string | null; actorType: 'owner' | 'client' | 'system'
    actorUserId?: string | null; action: AuditAction
    targetType?: string | null; targetId?: string | null; metadata?: Record<string, unknown>
  },
): Promise<void> {
  await supabase.rpc('append_client_audit', {
    p_business_id: args.businessId,
    p_client_id: args.clientId ?? null,
    p_actor_type: args.actorType,
    p_actor_user_id: args.actorUserId ?? null,
    p_action: args.action,
    p_target_type: args.targetType ?? null,
    p_target_id: args.targetId ?? null,
    p_metadata: (args.metadata ?? {}) as unknown,
  })
}

/**
 * Audit-ledger-backed rate limit: true if fewer than `max` rows of `action`
 * exist for `businessId` within the last `windowMinutes`. Since abuse-sensitive
 * actions are audited anyway, the audit table doubles as the limiter — no extra
 * table. Fails OPEN only if the count query errors (logged by caller); callers
 * treat a false return as "throttled".
 */
export async function withinRateLimit(
  supabase: SupabaseClient,
  businessId: string,
  action: AuditAction,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('client_access_audit')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('action', action)
    .gte('created_at', since)
  return (count ?? 0) < max
}
