// stories/status.ts — Polled by the Dashboard while a render is in flight.
//
// GET /api/stories/status?renderId=<uuid>
//   → 200 { ok: true, status: 'queued'|'rendering'|'ready'|'failed',
//           renderId, output_path?, error_message? }
//   → 400 { ok: false, error: 'invalid_render_id' }
//   → 401 { ok: false, error: 'unauthenticated' }
//   → 403 { ok: false, error: 'not_owner' }
//   → 404 { ok: false, error: 'render_not_found' }
//   → 500 { ok: false, error: 'server_misconfigured' | 'lookup_failed' }
//
// Side-effect on `status='ready'`:
//   When the Lambda completion path writes back output_path on the
//   story_renders row, this endpoint inserts a matching row into the public
//   `stories` table (idempotent — ON CONFLICT DO NOTHING via a unique check)
//   so the public viewer surfaces the mp4 with zero client writes.
//
// Auth model mirrors /api/stories/render: Bearer token + service-role read
// + manual owner check (deterministic 403 over an empty 404).

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Story length defaults to 30s in the Phase 0 Clean composition. We persist
// the same default in the public `stories.duration` column so the viewer's
// progress bar matches what the renderer produced.
const DEFAULT_STORY_DURATION_SECONDS = 30

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  // ── Input validation ───────────────────────────────────────────────────
  const renderIdRaw = typeof req.query.renderId === 'string'
    ? req.query.renderId.trim()
    : ''
  if (!renderIdRaw || !UUID_RE.test(renderIdRaw)) {
    return res.status(400).json({ ok: false, error: 'invalid_render_id' })
  }

  // ── Auth ───────────────────────────────────────────────────────────────
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

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Fetch render row + owning gallery in one shot ─────────────────────
  // The join shape mirrors /api/stories/render so the owner check is
  // identical across the two endpoints.
  const { data: row, error: rowErr } = await adminClient
    .from('story_renders')
    .select('id, gallery_id, style, status, lambda_render_id, error_message, output_path, galleries!inner(id, business_id, businesses!inner(user_id))')
    .eq('id', renderIdRaw)
    .maybeSingle()
  if (rowErr) {
    console.error('[stories/status] lookup failed', rowErr.message)
    return res.status(500).json({ ok: false, error: 'lookup_failed' })
  }
  if (!row) {
    return res.status(404).json({ ok: false, error: 'render_not_found' })
  }

  // Walk the join to the owning user. The Supabase types sometimes union
  // nested joins with arrays — cast defensively (same pattern as render.ts).
  const gj = (row as { galleries?: unknown }).galleries
  const galleryObj = Array.isArray(gj) ? gj[0] : gj
  const bizObj = (galleryObj as { businesses?: unknown } | undefined)?.businesses
  const bizRow = Array.isArray(bizObj) ? bizObj[0] : bizObj
  const ownerUserId = (bizRow as { user_id?: string } | undefined)?.user_id
  if (!ownerUserId || ownerUserId !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }

  // ── Side-effect: surface a 'ready' render to the public stories table ─
  // The Lambda completion path writes output_path + status='ready' onto
  // story_renders. The viewer reads from the public `stories` table, so we
  // bridge the two here. We key on storage_path so retries of this endpoint
  // (or multiple browser tabs polling) don't create duplicate rows.
  if (row.status === 'ready' && row.output_path) {
    try {
      const { data: existingStory } = await adminClient
        .from('stories')
        .select('id')
        .eq('storage_path', row.output_path)
        .maybeSingle()
      if (!existingStory) {
        await adminClient.from('stories').insert({
          gallery_id: row.gallery_id,
          style: row.style,
          storage_path: row.output_path,
          duration: DEFAULT_STORY_DURATION_SECONDS,
        })
      }
    } catch (err) {
      // Best-effort — if the public row already exists or the insert races,
      // we still return the underlying render status so the UI moves on.
      const msg = err instanceof Error ? err.message : 'unknown'
      console.error('[stories/status] stories upsert soft-failed', msg)
    }
  }

  return res.status(200).json({
    ok: true,
    renderId: row.id,
    status: row.status,
    output_path: row.output_path ?? null,
    error_message: row.error_message ?? null,
  })
}
