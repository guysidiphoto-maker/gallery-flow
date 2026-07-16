// Shared security helpers for public, unauthenticated API endpoints.
//
// Files under /api whose name starts with "_" are NOT treated as routes by
// Vercel — this is a shared module, not an endpoint.
//
// Used to defend cost-bearing public endpoints (SMS via Twilio, email via
// Resend) against automated abuse / wallet-drain. The primary defense is a
// Cloudflare Turnstile challenge; a per-resource throughput cap is layered on
// top as defense-in-depth.
//
// Turnstile env (already provisioned for the public-gallery-session flow):
//   CF_TURNSTILE_SECRET        — server-side secret key
//   VITE_CF_TURNSTILE_SITE_KEY — public site key (client renders the widget)
//
// Philosophy: when CF_TURNSTILE_SECRET is UNSET (e.g. local dev), verification
// fails open with a warning so development isn't blocked. In every environment
// where the secret is configured (staging/prod), it fails closed.

import type { VercelRequest } from '@vercel/node'

const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** True when Turnstile is configured and must be enforced in this environment. */
export function isTurnstileEnforced(): boolean {
  return CF_TURNSTILE_SECRET.length > 0
}

/**
 * Extract the real client IP behind Vercel's proxy. The first entry of
 * x-forwarded-for is the originating client.
 */
export function getClientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : xff
  if (xffStr) return xffStr.split(',')[0].trim()
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string') return cf
  const real = req.headers['x-real-ip']
  if (typeof real === 'string') return real
  return '0.0.0.0'
}

/**
 * Verify a Cloudflare Turnstile token via siteverify. Returns true iff
 * Cloudflare confirms it. Fails closed on network errors so a flaky
 * Cloudflare doesn't open the gate. Returns false when the secret is unset —
 * callers should branch on isTurnstileEnforced() to decide fail-open vs closed.
 */
export async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  if (!CF_TURNSTILE_SECRET) return false
  if (!token) return false
  try {
    const form = new URLSearchParams()
    form.set('secret', CF_TURNSTILE_SECRET)
    form.set('response', token)
    if (ip && ip !== '0.0.0.0') form.set('remoteip', ip)
    const r = await fetch(CF_TURNSTILE_SITEVERIFY_URL, { method: 'POST', body: form })
    if (!r.ok) return false
    const j = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!j.success) {
      console.warn('[turnstile] siteverify rejected', { 'error-codes': j['error-codes'] ?? [] })
      return false
    }
    return true
  } catch (err) {
    console.warn('[turnstile] siteverify error', err)
    return false
  }
}

/**
 * Resolve whether a cost-bearing action (SMS/email) is allowed for this
 * request, based purely on the Turnstile challenge.
 *
 * - Secret configured  → allowed only with a Cloudflare-verified token.
 * - Secret unset (dev) → allowed, but logged (fail-open).
 */
export async function passesHumanCheck(token: string, ip: string): Promise<boolean> {
  if (!isTurnstileEnforced()) {
    console.warn('[security] CF_TURNSTILE_SECRET unset — human check bypassed (dev/fail-open)')
    return true
  }
  return verifyTurnstileToken(token, ip)
}
