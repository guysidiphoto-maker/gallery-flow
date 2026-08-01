// features.ts — server-side feature availability (overnight contract C1).
//
// Mirror of src/lib/features.ts for the Vercel API functions. Every Social /
// Production endpoint (generate-feed, generate-campaign, plan-event,
// score-images, generate-captions, and the social actions of
// append-event-posts) checks this flag FIRST — before origin, auth, ownership
// or entitlement resolution — and returns 403 { ok:false, error:
// 'feature_disabled' } when the feature is off.
//
// Default is OFF: no environment sets FEATURE_SOCIAL_STUDIO today, so these
// endpoints are closed for everyone regardless of entitlement. The existing
// entitlement gates remain intact underneath for the day the flag turns on.
//
// Read at CALL time (not module load) so a per-request evaluation always
// reflects the current environment; fails CLOSED on any access error.

import type { VercelResponse } from '@vercel/node'

export function socialStudioEnabled(): boolean {
  try {
    return process.env.FEATURE_SOCIAL_STUDIO === 'true'
  } catch {
    return false
  }
}

/**
 * Gate helper for handlers. Returns true when the Social studio feature is
 * enabled; otherwise writes the canonical 403 feature_disabled response and
 * returns false so the caller can simply `if (!requireSocialStudio(res)) return`.
 */
export function requireSocialStudio(res: VercelResponse): boolean {
  if (socialStudioEnabled()) return true
  res.status(403).json({ ok: false, error: 'feature_disabled' })
  return false
}
