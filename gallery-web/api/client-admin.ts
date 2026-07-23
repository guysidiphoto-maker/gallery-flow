// client-admin.ts — owner-side (photographer/production) Client Portal V2 write
// surface. ONE multi-action endpoint (Vercel function-count discipline) for every
// mutating owner operation. Reads are done directly by the UI via the self-scoped
// cpv2_owner_* RPCs (migration 092).
//
// Security contract (enforced for EVERY action):
//   1. valid Supabase JWT (Bearer)                    → requireOwnerBusiness
//   2. business resolved from auth.uid() (never body) → requireOwnerBusiness
//   3. target client/gallery/membership belongs to that business (re-checked)
//   4. mutation via service-role or a tenant-checked SECURITY DEFINER RPC
//   5. audited to client_access_audit; abuse-sensitive actions are rate-limited
//   6. minimal, consistent JSON responses; failures fail closed
//
// NO real emails are sent. Invitation + password-reset links are generated and
// RETURNED for the owner to deliver (email delivery is a later, manual step).

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import {
  requireOwnerBusiness, clientBelongsToBusiness, appendAudit, withinRateLimit,
  normalizeEmail, isValidEmail, isRole, isSettableStatus,
  genInviteToken, sha256Hex, inviteExpiryISO,
} from '../server/clientAdmin.js'

export const maxDuration = 30

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const h = new URL(origin).hostname
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app') ||
      h === 'pixflow.co.il' || h.endsWith('.pixflow.co.il') ||
      h === 'pixflow-ai.com' || h.endsWith('.pixflow-ai.com') ||
      h === 'eclipsemedia.co.il' || h.endsWith('.eclipsemedia.co.il')
  } catch { return false }
}

function originBase(req: VercelRequest): string {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin) return origin.replace(/\/$/, '')
  const host = req.headers.host
  return host ? `https://${host}` : ''
}
function acceptLink(req: VercelRequest, token: string): string {
  return `${originBase(req)}/client-invite/accept?token=${encodeURIComponent(token)}`
}

function slugifyClient(name: string): string {
  const base = name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return base || 'client'
}

type Json = Record<string, unknown>
const bad = (res: VercelResponse, status: number, code: string, extra?: Json) =>
  res.status(status).json({ ok: false, error: code, ...(extra ?? {}) })

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { bad(res, 405, 'method_not_allowed'); return }
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) { bad(res, 403, 'forbidden_origin'); return }
  if (!supabase) { bad(res, 500, 'supabase_not_configured'); return }

  const body = (req.body ?? {}) as Json
  const action = String(body.action ?? '')

  // Gate: valid JWT + resolve the caller's business (never trust body business_id).
  const owner = await requireOwnerBusiness(req, supabase)
  if (!owner.ok) { bad(res, owner.status, owner.code); return }
  const businessId = owner.businessId
  const actorUserId = owner.userId

  try {
    switch (action) {
      // ── create_client ──────────────────────────────────────────────────
      case 'create_client': {
        const name = String(body.name ?? '').trim()
        if (!name) return void bad(res, 400, 'name_required')
        const contactName = String(body.contactName ?? '').trim() || null
        const email = normalizeEmail(body.email)
        const wantInvite = body.invite === true
        if (wantInvite && !isValidEmail(email)) return void bad(res, 400, 'invalid_email')

        // Insert client with a unique slug (retry once on collision).
        let clientId: string | null = null
        for (let attempt = 0; attempt < 3 && !clientId; attempt++) {
          const slug = attempt === 0 ? slugifyClient(name)
            : `${slugifyClient(name)}-${genInviteToken().token.slice(0, 5).toLowerCase()}`
          const { data, error } = await supabase.from('clients')
            .insert({ name, business_id: businessId, slug }).select('id').maybeSingle()
          if (data?.id) { clientId = data.id as string; break }
          if (error && !String(error.message).includes('duplicate')) {
            return void bad(res, 500, 'create_failed', { detail: error.message?.slice(0, 200) })
          }
        }
        if (!clientId) return void bad(res, 500, 'create_failed')

        await appendAudit(supabase, {
          businessId, clientId, actorType: 'owner', actorUserId,
          action: 'client_created', targetType: 'client', targetId: clientId,
          metadata: { name, contactName },
        })

        let invite: { link: string; email: string } | undefined
        if (wantInvite) {
          invite = await createInvite(req, businessId, clientId, email, 'client_admin', actorUserId)
        }
        return void res.status(200).json({ ok: true, client_id: clientId, invite })
      }

      // ── invite_member ──────────────────────────────────────────────────
      case 'invite_member': {
        const clientId = String(body.clientId ?? '')
        const email = normalizeEmail(body.email)
        const role = isRole(body.role) ? body.role : 'viewer'
        if (!clientId) return void bad(res, 400, 'clientId_required')
        if (!isValidEmail(email)) return void bad(res, 400, 'invalid_email')
        if (!(await clientBelongsToBusiness(supabase, clientId, businessId))) return void bad(res, 403, 'forbidden')
        if (!(await withinRateLimit(supabase, businessId, 'invitation_sent', 30, 60))) return void bad(res, 429, 'rate_limited')

        // Refuse a duplicate ACTIVE member; otherwise (re)issue an invite.
        const { data: existing } = await supabase.from('client_memberships')
          .select('id, status').eq('client_id', clientId).eq('email', email).maybeSingle()
        if (existing && existing.status === 'active') return void bad(res, 409, 'already_active_member')

        const invite = await createInvite(req, businessId, clientId, email, role, actorUserId, existing?.id as string | undefined)
        return void res.status(200).json({ ok: true, invite })
      }

      // ── resend_invitation ──────────────────────────────────────────────
      case 'resend_invitation': {
        const invitationId = String(body.invitationId ?? '')
        if (!invitationId) return void bad(res, 400, 'invitationId_required')
        const { data: inv } = await supabase.from('client_invitations')
          .select('id, business_id, client_id, email, status, resent_count').eq('id', invitationId).maybeSingle()
        if (!inv || inv.business_id !== businessId) return void bad(res, 403, 'forbidden')
        if (inv.status !== 'pending') return void bad(res, 409, 'not_pending')
        if (!(await withinRateLimit(supabase, businessId, 'invitation_resent', 30, 60))) return void bad(res, 429, 'rate_limited')

        const { token, tokenHash } = genInviteToken()
        const currentResent = (inv as { resent_count?: number }).resent_count ?? 0
        const { error } = await supabase.from('client_invitations')
          .update({ token_hash: tokenHash, expires_at: inviteExpiryISO(), resent_count: currentResent + 1 })
          .eq('id', invitationId)
        if (error) return void bad(res, 500, 'resend_failed', { detail: error.message?.slice(0, 200) })
        await appendAudit(supabase, {
          businessId, clientId: inv.client_id as string, actorType: 'owner', actorUserId,
          action: 'invitation_resent', targetType: 'invitation', targetId: invitationId,
        })
        return void res.status(200).json({ ok: true, invite: { link: acceptLink(req, token), email: inv.email } })
      }

      // ── cancel_invitation ──────────────────────────────────────────────
      case 'cancel_invitation': {
        const invitationId = String(body.invitationId ?? '')
        if (!invitationId) return void bad(res, 400, 'invitationId_required')
        const { data: inv } = await supabase.from('client_invitations')
          .select('id, business_id, client_id, status').eq('id', invitationId).maybeSingle()
        if (!inv || inv.business_id !== businessId) return void bad(res, 403, 'forbidden')
        await supabase.from('client_invitations').update({ status: 'cancelled' }).eq('id', invitationId)
        await appendAudit(supabase, {
          businessId, clientId: inv.client_id as string, actorType: 'owner', actorUserId,
          action: 'invitation_cancelled', targetType: 'invitation', targetId: invitationId,
        })
        return void res.status(200).json({ ok: true })
      }

      // ── set_membership_status (disable / reactivate / revoke) ───────────
      case 'set_membership_status': {
        const membershipId = String(body.membershipId ?? '')
        const status = body.status
        if (!membershipId) return void bad(res, 400, 'membershipId_required')
        if (!isSettableStatus(status)) return void bad(res, 400, 'invalid_status')
        const { data: m } = await supabase.from('client_memberships')
          .select('id, business_id, client_id').eq('id', membershipId).maybeSingle()
        if (!m || m.business_id !== businessId) return void bad(res, 403, 'forbidden')

        const { error } = await supabase.rpc('cpv2_set_membership_status', {
          p_business_id: businessId, p_membership_id: membershipId, p_status: status,
        })
        if (error) return void bad(res, 500, 'status_failed', { detail: error.message?.slice(0, 200) })

        const auditAction = status === 'disabled' ? 'membership_disabled'
          : status === 'revoked' ? 'membership_revoked' : 'membership_reactivated'
        await appendAudit(supabase, {
          businessId, clientId: m.client_id as string, actorType: 'owner', actorUserId,
          action: auditAction, targetType: 'membership', targetId: membershipId,
        })
        return void res.status(200).json({ ok: true, status })
      }

      // ── send_password_reset (Supabase recovery link; no email sent) ─────
      case 'send_password_reset': {
        const membershipId = String(body.membershipId ?? '')
        if (!membershipId) return void bad(res, 400, 'membershipId_required')
        const { data: m } = await supabase.from('client_memberships')
          .select('id, business_id, client_id, email, auth_user_id').eq('id', membershipId).maybeSingle()
        if (!m || m.business_id !== businessId) return void bad(res, 403, 'forbidden')
        if (!m.auth_user_id) return void bad(res, 409, 'not_accepted_yet')
        if (!(await withinRateLimit(supabase, businessId, 'password_reset_requested', 20, 60))) return void bad(res, 429, 'rate_limited')

        const { data: link, error } = await supabase.auth.admin.generateLink({
          type: 'recovery', email: String(m.email),
        })
        if (error) return void bad(res, 500, 'reset_failed', { detail: error.message?.slice(0, 200) })
        await appendAudit(supabase, {
          businessId, clientId: m.client_id as string, actorType: 'owner', actorUserId,
          action: 'password_reset_requested', targetType: 'membership', targetId: membershipId,
        })
        return void res.status(200).json({ ok: true, reset_link: link?.properties?.action_link ?? null })
      }

      // ── assign_gallery / reassign_gallery ───────────────────────────────
      case 'assign_gallery':
      case 'reassign_gallery': {
        const galleryId = String(body.galleryId ?? '')
        const clientId = String(body.clientId ?? '')
        if (!galleryId || !clientId) return void bad(res, 400, 'galleryId_and_clientId_required')
        const { data, error } = await supabase.rpc('cpv2_assign_gallery', {
          p_business_id: businessId, p_gallery_id: galleryId, p_client_id: clientId,
        })
        if (error) return void bad(res, 400, 'assign_failed', { detail: error.message?.slice(0, 200) })
        const prev = (data as { previous_client_id?: string } | null)?.previous_client_id ?? null
        const reassigned = !!prev && prev !== clientId
        await appendAudit(supabase, {
          businessId, clientId, actorType: 'owner', actorUserId,
          action: reassigned ? 'gallery_reassigned' : 'gallery_assigned',
          targetType: 'gallery', targetId: galleryId,
          metadata: reassigned ? { previous_client_id: prev } : {},
        })
        return void res.status(200).json({ ok: true, gallery_id: galleryId, client_id: clientId, reassigned })
      }

      // ── unassign_gallery ────────────────────────────────────────────────
      case 'unassign_gallery': {
        const galleryId = String(body.galleryId ?? '')
        if (!galleryId) return void bad(res, 400, 'galleryId_required')
        const { data, error } = await supabase.rpc('cpv2_unassign_gallery', {
          p_business_id: businessId, p_gallery_id: galleryId,
        })
        if (error) return void bad(res, 400, 'unassign_failed', { detail: error.message?.slice(0, 200) })
        const prev = (data as { previous_client_id?: string } | null)?.previous_client_id ?? null
        await appendAudit(supabase, {
          businessId, clientId: prev, actorType: 'owner', actorUserId,
          action: 'gallery_unassigned', targetType: 'gallery', targetId: galleryId,
        })
        return void res.status(200).json({ ok: true, gallery_id: galleryId })
      }

      default:
        return void bad(res, 400, 'unknown_action')
    }
  } catch (e) {
    return void bad(res, 500, 'internal_error', { detail: (e as Error)?.message?.slice(0, 200) })
  }
}

/** Create membership (if needed) + a pending invitation; return the accept link. */
async function createInvite(
  req: VercelRequest, businessId: string, clientId: string, email: string,
  role: string, actorUserId: string, existingMembershipId?: string,
): Promise<{ link: string; email: string }> {
  const sb = supabase!
  let membershipId = existingMembershipId
  if (!membershipId) {
    const { data } = await sb.from('client_memberships').insert({
      business_id: businessId, client_id: clientId, email, role,
      status: 'invited', invited_by: actorUserId,
    }).select('id').maybeSingle()
    membershipId = data?.id as string
  }
  const { token, tokenHash } = genInviteToken()
  await sb.from('client_invitations').insert({
    membership_id: membershipId, business_id: businessId, client_id: clientId,
    email, token_hash: tokenHash, status: 'pending', expires_at: inviteExpiryISO(),
  })
  await appendAudit(sb, {
    businessId, clientId, actorType: 'owner', actorUserId,
    action: 'invitation_sent', targetType: 'membership', targetId: membershipId, metadata: { email, role },
  })
  return { link: acceptLink(req, token), email }
}

export default withSentry(handler)
