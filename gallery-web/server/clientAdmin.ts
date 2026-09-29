// Shared helpers for the client-portal owner + portal APIs. The supabase-taking
// helpers centralize the authorization boundary so no endpoint re-implements it.

import { createHash, randomBytes } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuthedUser, type GateFailure } from './ownerAuth.js'

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

const INVITE_TTL_DAYS = 7
export function inviteExpiryISO(nowMs: number = Date.now()): string {
  return new Date(nowMs + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

const ROLES = ['client_admin', 'approver', 'viewer'] as const
export type Role = (typeof ROLES)[number]
export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x)
}

const SETTABLE_STATUSES = ['active', 'disabled', 'revoked'] as const
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

export const BULK_ASSIGN_MAX = 200

export interface BulkAssignInput {
  clientId: string
  galleryIds: string[]
}

export type BulkAssignValidation =
  | { ok: true; input: BulkAssignInput }
  | { ok: false; code: 'clientId_required' | 'galleryIds_required' | 'invalid_galleryIds' | 'too_many_galleries' }

/** Any bad entry rejects the whole call (no silent dropping); the cap applies after dedupe. */
export function validateBulkAssignInput(body: Record<string, unknown>): BulkAssignValidation {
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  if (!clientId) return { ok: false, code: 'clientId_required' }
  const raw = body.galleryIds
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, code: 'galleryIds_required' }
  const ids: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry.trim()) return { ok: false, code: 'invalid_galleryIds' }
    ids.push(entry.trim())
  }
  const deduped = Array.from(new Set(ids))
  if (deduped.length > BULK_ASSIGN_MAX) return { ok: false, code: 'too_many_galleries' }
  return { ok: true, input: { clientId, galleryIds: deduped } }
}

export interface BulkAssignItemResult {
  galleryId: string
  ok: boolean
  /** Moved from a DIFFERENT client to the target client. */
  reassigned?: boolean
  /** Already assigned to the target client — idempotent no-op (not audited). */
  unchanged?: boolean
  error?: string
}

export interface BulkAssignSummary {
  total: number
  assigned: number
  reassigned: number
  unchanged: number
  failed: number
  results: BulkAssignItemResult[]
}

/**
 * A failing gallery never aborts the rest. Only real state changes are audited,
 * not idempotent no-ops. Caller must already have verified client ownership.
 */
export async function runBulkAssign(
  supabase: SupabaseClient,
  args: { businessId: string; actorUserId: string; clientId: string; galleryIds: string[] },
): Promise<BulkAssignSummary> {
  const { businessId, actorUserId, clientId, galleryIds } = args
  const results: BulkAssignItemResult[] = []
  let assigned = 0, reassigned = 0, unchanged = 0, failed = 0

  for (const galleryId of galleryIds) {
    try {
      const { data, error } = await supabase.rpc('cpv2_assign_gallery', {
        p_business_id: businessId, p_gallery_id: galleryId, p_client_id: clientId,
      })
      if (error) {
        failed++
        results.push({ galleryId, ok: false, error: String(error.message ?? 'assign_failed').slice(0, 200) })
        continue
      }
      const prev = (data as { previous_client_id?: string | null } | null)?.previous_client_id ?? null
      if (prev === clientId) {
        unchanged++
        results.push({ galleryId, ok: true, unchanged: true })
        continue
      }
      const wasReassign = !!prev
      if (wasReassign) reassigned++
      else assigned++
      await appendAudit(supabase, {
        businessId, clientId, actorType: 'owner', actorUserId,
        action: wasReassign ? 'gallery_reassigned' : 'gallery_assigned',
        targetType: 'gallery', targetId: galleryId,
        metadata: wasReassign ? { bulk: true, previous_client_id: prev } : { bulk: true },
      })
      results.push({ galleryId, ok: true, reassigned: wasReassign })
    } catch (e) {
      failed++
      results.push({ galleryId, ok: false, error: String((e as Error)?.message ?? 'assign_failed').slice(0, 200) })
    }
  }

  return { total: galleryIds.length, assigned, reassigned, unchanged, failed, results }
}

export type OwnerBusinessOk = { ok: true; userId: string; businessId: string }

/** Resolve the caller to their (single) business. The returned businessId is the
 *  only tenant an owner API may act within — never trust one from the body. */
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

/** True if fewer than `max` `action` rows exist in the window. Abuse-sensitive
 *  actions are audited anyway, so the audit table doubles as the limiter. */
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
