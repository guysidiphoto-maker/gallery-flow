// Polled while a render is in flight. When a render is 'ready' it also bridges
// the row into the public `stories` table (idempotent on storage_path) so the
// viewer picks up the mp4 without any client writes.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../server/env.js'
import { serviceClient } from '../../server/supabase.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Matches the Clean composition's default length so the viewer's progress bar lines up.
const DEFAULT_STORY_DURATION_SECONDS = 30

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const adminClient = serviceClient()
  if (!adminClient) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  const renderIdRaw = typeof req.query.renderId === 'string'
    ? req.query.renderId.trim()
    : ''
  if (!renderIdRaw || !UUID_RE.test(renderIdRaw)) {
    return res.status(400).json({ ok: false, error: 'invalid_render_id' })
  }

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

  // Nested joins may come back as arrays; cast defensively.
  const gj = (row as { galleries?: unknown }).galleries
  const galleryObj = Array.isArray(gj) ? gj[0] : gj
  const bizObj = (galleryObj as { businesses?: unknown } | undefined)?.businesses
  const bizRow = Array.isArray(bizObj) ? bizObj[0] : bizObj
  const ownerUserId = (bizRow as { user_id?: string } | undefined)?.user_id
  if (!ownerUserId || ownerUserId !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }

  // Keyed on storage_path so repeated polls (or several tabs) don't duplicate rows.
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
      // Best-effort: still return the render status so the UI moves on.
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

export default withSentry('stories/status', handler)
