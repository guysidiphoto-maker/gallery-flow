// publicEndpointGuards — shared hardening for the PUBLIC, unauthenticated
// endpoints that can spend real money (Twilio SMS / Resend email):
// capture-lead and submit-questionnaire.
//
// Everything here is stateless-friendly and works on Vercel serverless:
// - Rate limiting is PERSISTENT via a COUNT query against the endpoint's own
//   target table (event_leads / questionnaire_responses) over a time window.
//   It does NOT use an in-memory counter — those don't survive across the
//   ephemeral, multi-instance serverless invocations Vercel runs, so they'd be
//   security theatre. The DB row-count is the real, shared source of truth.
// - Turnstile verification reuses Cloudflare siteverify (same pattern as
//   api/append-event-posts.ts). Verify-if-present: a token, if sent, must be
//   valid; we do NOT hard-require one yet (the guest frontends don't send one),
//   so current flows are not blocked.
//
// No new tables/columns are introduced (per the "ask before a migration" rule).
// A true per-IP limit would need an `ip` column on those tables — see the
// endpoint reports for that follow-up option.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Input validators ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Deliberately simple + robust; not RFC-perfect, just enough to keep garbage
// out of a mail `to:` field.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export function isValidEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v)
}

/** Coerce unknown input to a trimmed, length-capped string (safe for SMS/DB). */
export function cleanText(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max)
}

// ── Client IP (for Turnstile remoteip + masked logging) ──────────────────────

export function clientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : xff
  const xReal = req.headers['x-real-ip']
  const xRealStr = Array.isArray(xReal) ? xReal[0] : xReal
  return (
    (xffStr ? xffStr.split(',')[0].trim() : '') ||
    (xRealStr || '') ||
    req.socket?.remoteAddress ||
    ''
  )
}

// ── PII-safe masking for logs (never log full phone/email) ───────────────────

export function maskPhone(p: string): string {
  const s = String(p || '')
  return s.length <= 3 ? '***' : `***${s.slice(-3)}`
}

export function maskEmail(e: string): string {
  const s = String(e || '')
  const at = s.indexOf('@')
  return at <= 1 ? '***' : `${s[0]}***${s.slice(at)}`
}

// ── Persistent rate limiting via DB row count ────────────────────────────────
// Counts rows in `table` where `column = value` and created_at is within the
// last `windowSeconds`. Real, shared state (the table itself) — survives cold
// starts and works across all serverless instances. Fails OPEN on a transient
// count error so a DB hiccup never blocks a legitimate guest.

export async function countSince(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  windowSeconds: number,
): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since)
  if (error) {
    console.warn(`[rate-limit] count failed ${table}.${column}: ${error.message}`)
    return 0
  }
  return count ?? 0
}

// ── Turnstile (Cloudflare) verification — verify-if-present ───────────────────
// Same siteverify flow as api/append-event-posts.ts. Returns true only when a
// secret is configured AND the token verifies. Callers treat a present-but-
// invalid token as a hard 400, and an absent token as "allowed for now"
// (enforcement turns on once the guest frontends send `turnstileToken`).

const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const turnstileConfigured = CF_TURNSTILE_SECRET !== ''

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!CF_TURNSTILE_SECRET || !token) return false
  try {
    const form = new URLSearchParams()
    form.set('secret', CF_TURNSTILE_SECRET)
    form.set('response', token)
    if (ip) form.set('remoteip', ip)
    const r = await fetch(CF_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const j = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (j.success !== true) {
      console.warn('[turnstile] siteverify rejected', { 'error-codes': j['error-codes'] ?? [] })
    }
    return j.success === true
  } catch (err) {
    console.warn('[turnstile] siteverify error', err instanceof Error ? err.message : err)
    return false
  }
}
