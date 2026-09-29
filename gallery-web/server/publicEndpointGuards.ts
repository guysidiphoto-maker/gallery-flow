// Shared hardening for the public, unauthenticated endpoints that spend real
// money (SMS/email): kill switch, persistent rate limits, Turnstile, validation
// and PII-safe log masking.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

// Enabled by default (the forms are fully protected); PUBLIC_FORMS_ENABLED=false
// is the emergency off switch.
export function isPublicFormsEnabled(): boolean {
  return process.env.PUBLIC_FORMS_ENABLED !== 'false'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Not RFC-perfect; just keeps garbage out of a mail `to:` field.
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

// Never log a full phone number or email.
export function maskPhone(p: string): string {
  const s = String(p || '')
  return s.length <= 3 ? '***' : `***${s.slice(-3)}`
}

export function maskEmail(e: string): string {
  const s = String(e || '')
  const at = s.indexOf('@')
  return at <= 1 ? '***' : `${s[0]}***${s.slice(at)}`
}

// Rate limit by counting the endpoint's own rows in the window: in-memory counters
// don't survive serverless instances. Fails open so a DB hiccup never blocks a guest.
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

// Callers hard-block only on 'invalid'; 'absent'/'unavailable' fall through to
// the rate limiter so a Cloudflare outage never blocks a legitimate guest.
const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

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
    console.warn('[turnstile] siteverify error', err instanceof Error ? err.message : err)
    return 'unavailable'
  }
}
