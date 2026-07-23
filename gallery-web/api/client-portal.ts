// client-portal.ts — client-facing Client Portal V2 endpoint (service-role).
//
// Two actions:
//   • validate_invitation — resolve an invite token (its sha256 hash) to the
//     invited email + client name + validity, so the accept page can render
//     without leaking anything. Returns { valid:false } for unknown/expired.
//   • accept_invitation — bind a Supabase Auth user to the membership. If the
//     email is NEW, create the account with the chosen password (email_confirm).
//     If the email ALREADY has an account (person belongs to another client),
//     bind to it WITHOUT changing its password (no account hijack) and tell the
//     client to log in with their existing credentials. On any binding failure
//     a just-created user is rolled back.
//
// The portal DATA path is NOT here — the authenticated client calls the
// self-scoped `client_portal_bootstrap()` RPC directly with its session.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { sha256Hex, normalizeEmail, isValidEmail, appendAudit } from '../server/clientAdmin.js'

export const maxDuration = 30

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

type Json = Record<string, unknown>
const bad = (res: VercelResponse, status: number, code: string, extra?: Json) =>
  res.status(status).json({ ok: false, error: code, ...(extra ?? {}) })

const MIN_PASSWORD = 8

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { bad(res, 405, 'method_not_allowed'); return }
  if (!supabase) { bad(res, 500, 'supabase_not_configured'); return }

  const body = (req.body ?? {}) as Json
  const action = String(body.action ?? '')
  const token = String(body.token ?? '').trim()

  try {
    // ── validate_invitation ────────────────────────────────────────────────
    if (action === 'validate_invitation') {
      if (!token) return void bad(res, 400, 'token_required')
      const inv = await lookupInvitation(token)
      if (!inv) return void res.status(200).json({ ok: true, valid: false })
      const expired = new Date(inv.expires_at).getTime() <= Date.now()
      const usable = inv.status === 'pending' && !expired
      let clientName: string | null = null
      if (usable) {
        const { data: c } = await supabase.from('clients').select('name').eq('id', inv.client_id).maybeSingle()
        clientName = (c?.name as string) ?? null
      }
      return void res.status(200).json({
        ok: true, valid: usable, email: usable ? inv.email : null,
        client_name: clientName, expired, status: inv.status,
      })
    }

    // ── accept_invitation ──────────────────────────────────────────────────
    if (action === 'accept_invitation') {
      const email = normalizeEmail(body.email)
      const password = String(body.password ?? '')
      if (!token) return void bad(res, 400, 'token_required')
      if (!isValidEmail(email)) return void bad(res, 400, 'invalid_email')
      if (password.length < MIN_PASSWORD) return void bad(res, 400, 'weak_password')

      const inv = await lookupInvitation(token)
      // Uniform error for any invalid/expired/mismatch → no oracle about which.
      if (!inv || inv.status !== 'pending' || new Date(inv.expires_at).getTime() <= Date.now()) {
        return void bad(res, 400, 'invitation_invalid')
      }
      if (normalizeEmail(inv.email) !== email) return void bad(res, 400, 'invitation_invalid')

      const tokenHash = sha256Hex(token)

      // Does this email already have an account?
      const { data: existingId } = await supabase.rpc('cpv2_auth_user_id_by_email', { p_email: email })
      let authUserId = (existingId as string | null) ?? null
      let createdNew = false
      let requiresLogin = false

      if (!authUserId) {
        const { data: created, error: cErr } = await supabase.auth.admin.createUser({
          email, password, email_confirm: true,
        })
        if (cErr || !created?.user?.id) return void bad(res, 500, 'account_create_failed')
        authUserId = created.user.id
        createdNew = true
      } else {
        // Pre-existing account: bind WITHOUT changing the password.
        requiresLogin = true
      }

      // Bind membership atomically via the definer RPC (re-validates hash/expiry/email).
      const { data: bound, error: bErr } = await supabase.rpc('cpv2_accept_invitation', {
        p_token_hash: tokenHash, p_auth_user_id: authUserId, p_email: email,
      })
      if (bErr) {
        if (createdNew && authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => {})
        return void bad(res, 400, 'invitation_invalid')
      }

      const b = bound as { membership_id?: string; client_id?: string; business_id?: string } | null
      if (b?.business_id) {
        await appendAudit(supabase, {
          businessId: b.business_id, clientId: b.client_id ?? null, actorType: 'client',
          actorUserId: authUserId, action: 'invitation_accepted',
          targetType: 'membership', targetId: b.membership_id ?? null, metadata: { email },
        })
      }
      // requires_login=true → client already had an account; sign in with existing
      // password. false → new account created with the chosen password.
      return void res.status(200).json({ ok: true, email, requires_login: requiresLogin })
    }

    return void bad(res, 400, 'unknown_action')
  } catch (e) {
    return void bad(res, 500, 'internal_error', { detail: (e as Error)?.message?.slice(0, 200) })
  }
}

type InvitationRow = { id: string; client_id: string; email: string; status: string; expires_at: string }
async function lookupInvitation(rawToken: string): Promise<InvitationRow | null> {
  const sb = supabase!
  const tokenHash = sha256Hex(rawToken)
  const { data } = await sb.from('client_invitations')
    .select('id, client_id, email, status, expires_at').eq('token_hash', tokenHash).maybeSingle()
  return (data as InvitationRow) ?? null
}

export default withSentry(handler)
