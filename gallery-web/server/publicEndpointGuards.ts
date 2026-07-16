// publicEndpointGuards — shared hardening for the PUBLIC, unauthenticated
// endpoints that can spend real money (Twilio SMS / Resend email):
// capture-lead and submit-questionnaire.
//
// This is the SINGLE SOURCE OF TRUTH for the public-form security posture:
//   • kill switch          → isPublicFormsEnabled()   (env PUBLIC_FORMS_ENABLED)
//   • per-endpoint limits   → the endpoints import these + their own constants
//   • rate limiting         → countSince() (persistent DB row-count)
//   • Turnstile             → verifyTurnstileToken() (tri-state, fail-open-safe)
//   • input validation      → isUuid / isValidEmail / cleanText
//   • PII-safe logging      → maskPhone / maskEmail  (never log raw phone/email)
//
// Rate limiting is PERSISTENT via a COUNT query against the endpoint's own
// target table (event_leads / questionnaire_responses) over a time window — it
// does NOT use an in-memory counter, which wouldn't survive Vercel's ephemeral,
// multi-instance serverless invocations. The DB row-count is the real, shared
// source of truth. No new tables/columns are introduced.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Kill switch (single source of truth for public-form enable state) ─────────
// DECISION (2026-07-16 reconciliation): the forms are ENABLED by default and
// disabled only when PUBLIC_FORMS_ENABLED === 'false'. Rationale: lead capture
// and questionnaire submission are real product flows, and they are now fully
// protected (Turnstile + persistent rate limits + input validation). The
// earlier branch defaulted OFF because the endpoints were unprotected; that
// reason no longer holds. Set PUBLIC_FORMS_ENABLED=false as an emergency off.
export function isPublicFormsEnabled(): boolean {
  return process.env.PUBLIC_FORMS_ENABLED !== 'false'
}

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

// ── Turnstile (Cloudflare) verification — tri-state, fail-open-safe ───────────
// Returns:
//   'ok'          — Cloudflare confirmed the token is a real human.
//   'invalid'     — Cloudflare definitively rejected the token (bot / garbage).
//   'unavailable' — we could not verify (no secret configured, network error,
//                   or a non-200 from siteverify).
//   'absent'      — no token was supplied.
//
// Callers HARD-BLOCK only on 'invalid'. 'absent'/'unavailable' fall through to
// the persistent rate limiter, so a Cloudflare outage or a widget that failed
// to load never blocks a legitimate guest (requirement: availability under
// external-service failure). This is the key difference from a naive
// boolean verifier that would treat a network error as "reject".

const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const turnstileConfigured = CF_TURNSTILE_SECRET !== ''

export type TurnstileResult = 'ok' | 'invalid' | 'unavailable' | 'absent'

export async function verifyTurnstileToken(token: string, ip: string): Promise<TurnstileResult> {
  if (!token) return 'absent'
  if (!CF_TURNSTILE_SECRET) return 'unavailable'
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
    if (!r.ok) return 'unavailable' // siteverify itself is down → don't block
    const j = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (j.success === true) return 'ok'
    console.warn('[turnstile] siteverify rejected', { 'error-codes': j['error-codes'] ?? [] })
    return 'invalid'
  } catch (err) {
    // Network / parse error → treat as unavailable (fail open to rate limits),
    // never as a hard reject of a possibly-legitimate user.
    console.warn('[turnstile] siteverify error', err instanceof Error ? err.message : err)
    return 'unavailable'
  }
}
