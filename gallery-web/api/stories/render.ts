// stories/render.ts — Phase 1 SCAFFOLD for the Story render endpoint.
//
// This is the server-side counterpart to the Dashboard "צור סטורי אוטומטית"
// CTA. In Phase 1 it does NOT actually render anything — it validates the
// request, auth-checks the caller against the gallery owner, and returns a
// queued status so the Dashboard's flow (modal → POST → toast) is testable
// end-to-end without standing up Remotion Lambda.
//
// Phase 2 will replace the stubbed success branch with the actual Remotion
// Lambda invocation (see the TODO Phase 2 block at the bottom of the file).
//
// Request:  POST { galleryId: string (uuid), style: 'clean' }
// Response: 200 { ok: true, status: 'queued', message: '...' }
//           400 { ok: false, error: '...' }
//           401 { ok: false, error: 'unauthenticated' }
//           403 { ok: false, error: 'not_owner' }
//           404 { ok: false, error: 'gallery_not_found' }
//           405 { ok: false, error: 'method_not_allowed' }
//           500 { ok: false, error: 'server_misconfigured' }

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Phase 1 supports only the "clean" style — the only one Phase 0 implemented
// in `gallery-web/stories-remotion/src/Clean.tsx`. Phase 2 will widen this
// enum as more compositions land.
const ALLOWED_STYLES = ['clean'] as const
type AllowedStyle = typeof ALLOWED_STYLES[number]

// Loose UUID v4-ish regex. We only need to reject obviously-malformed input
// at the edge; Supabase's typed `eq('id', …)` will hard-reject anything that
// slips through.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAllowedStyle(value: unknown): value is AllowedStyle {
  return typeof value === 'string' && (ALLOWED_STYLES as readonly string[]).includes(value)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    // Hard-fail loudly — without env we cannot auth-check, and silently
    // returning success would let any caller "queue" a render in Phase 2.
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  // ── Input validation ───────────────────────────────────────────────────
  const body = (req.body || {}) as { galleryId?: unknown; style?: unknown }
  const galleryId = typeof body.galleryId === 'string' ? body.galleryId.trim() : ''
  const style = body.style

  if (!galleryId || !UUID_RE.test(galleryId)) {
    return res.status(400).json({ ok: false, error: 'invalid_gallery_id' })
  }
  if (!isAllowedStyle(style)) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_style',
      allowed: ALLOWED_STYLES,
    })
  }

  // ── Auth check: only the gallery owner may trigger a render ───────────
  // We resolve the caller via the Bearer access token sent by the browser
  // (Supabase JS attaches it on every authenticated request). The userClient
  // is anon+token — it identifies "who is calling". The service client below
  // bypasses RLS so we can verify ownership without depending on the policy
  // surface.
  const authHeader = req.headers.authorization || ''
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : ''
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'unauthenticated' })
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'unauthenticated' })
  }
  const userId = userData.user.id

  // Service-role read of the gallery row + the owning business. RLS would
  // already block other photographers, but we want a deterministic 403 over
  // an empty 404, so we read the row with service-role and compare ids
  // ourselves.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: gallery, error: galleryErr } = await adminClient
    .from('galleries')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', galleryId)
    .maybeSingle()
  if (galleryErr) {
    console.error('[stories/render] gallery fetch failed', galleryErr.message)
    return res.status(500).json({ ok: false, error: 'gallery_lookup_failed' })
  }
  if (!gallery) {
    return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  }
  // The joined `businesses` shape comes back as an object (single-row inner
  // join), but the Supabase types union it with array — cast defensively.
  const biz = (gallery as { businesses?: { user_id?: string } | Array<{ user_id?: string }> }).businesses
  const ownerUserId = Array.isArray(biz) ? biz[0]?.user_id : biz?.user_id
  if (!ownerUserId || ownerUserId !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }

  // ── Phase 1 stub: return queued without doing real work ────────────────
  // The Dashboard surfaces this as a toast and lets the photographer keep
  // working. Phase 2 will replace this branch with an actual Lambda kickoff
  // (see TODO Phase 2 below).
  return res.status(200).json({
    ok: true,
    status: 'queued',
    galleryId,
    style,
    message: 'Lambda integration pending Phase 2',
  })

  /* ───────────────────────────────────────────────────────────────────────
   * TODO Phase 2 — wire Remotion Lambda
   * ───────────────────────────────────────────────────────────────────────
   * The Phase 0 spike already proved the render path end-to-end via
   *   gallery-web/stories-remotion/src/render-local.ts
   * That script:
   *   1. Pulls images for `galleryId` from Supabase Storage,
   *   2. Renders Clean.tsx with the Remotion CLI,
   *   3. Uploads `{slug}/{galleryId}/story_{style}.mp4` back to the
   *      gallery-stories bucket and inserts a stories row.
   *
   * Phase 2 should:
   *   1. Replace the stubbed success branch above with a call to
   *      `renderMediaOnLambda` from `@remotion/lambda/client`
   *      (serveUrl + functionName come from env, set during
   *      `npm run lambda:deploy` in stories-remotion/).
   *   2. Insert a `story_renders` row keyed by (gallery_id, style) with
   *      status='queued' so retries are idempotent (this endpoint must
   *      short-circuit if a render is already in flight for the same
   *      (gallery, style) pair to avoid double-billing).
   *   3. Return { ok: true, status: 'rendering', renderId } and let the
   *      Dashboard poll a sibling endpoint (`/api/stories/status`) for
   *      progress + the eventual storage_path.
   *   4. On Lambda completion, the post-render hook uploads the mp4 to
   *      `{slug}/{galleryId}/story_{style}.mp4` (same path render-local.ts
   *      uses today) and inserts the stories row so the public viewer
   *      picks it up via `gallery_get_stories` with no client change.
   *
   * Reference: gallery-web/stories-remotion/README.md "Lambda render"
   * section for the deploy steps + cost envelope ($0.05–$0.20 / render).
   * ───────────────────────────────────────────────────────────────────── */
}
