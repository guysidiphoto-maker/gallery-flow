// stories/cancel.ts — cooperative cancel for an in-flight Story Studio render.
//
// The render runs synchronously inside a single Vercel Function and cannot be
// killed from outside. Cancel is therefore COOPERATIVE: this endpoint flips the
// in-flight row out of 'rendering' (to 'failed' with a 'cancelled by user'
// message — the status enum has no dedicated 'cancelled' value). The render
// function re-reads the row right before it promotes to 'ready'; seeing the row
// is no longer 'rendering', it discards the uploaded artifacts instead of
// completing. The client stops polling immediately.
//
// POST /api/stories/cancel  { galleryId: uuid, renderId?: uuid }
//   → 200 { ok: true, cancelled: boolean, status }
//   → 400/401/403/404/405/500 mirrors /api/stories/render
//
// Auth: Bearer token + service-role read + manual owner check (same as render).

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STUDIO_STYLE = 'studio'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  const body = (req.body || {}) as { galleryId?: unknown; renderId?: unknown }
  const galleryId = typeof body.galleryId === 'string' ? body.galleryId.trim() : ''
  if (!galleryId || !UUID_RE.test(galleryId)) {
    return res.status(400).json({ ok: false, error: 'invalid_gallery_id' })
  }
  const renderId = typeof body.renderId === 'string' && UUID_RE.test(body.renderId.trim())
    ? body.renderId.trim()
    : null

  const authHeader = req.headers.authorization || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  if (!accessToken) return res.status(401).json({ ok: false, error: 'unauthenticated' })

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) return res.status(401).json({ ok: false, error: 'unauthenticated' })
  const userId = userData.user.id

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Verify the caller owns the gallery.
  const { data: gallery, error: galleryErr } = await adminClient
    .from('galleries')
    .select('id, businesses!inner(user_id)')
    .eq('id', galleryId)
    .maybeSingle()
  if (galleryErr) return res.status(500).json({ ok: false, error: 'gallery_lookup_failed' })
  if (!gallery) return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  const biz = (gallery as { businesses?: { user_id?: string } | Array<{ user_id?: string }> }).businesses
  const bizRow = Array.isArray(biz) ? biz[0] : biz
  if (!bizRow?.user_id || bizRow.user_id !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }

  // Flip the in-flight row(s) out of the active states. Scope to the specific
  // renderId when provided; otherwise cancel whatever studio render is in flight
  // for this gallery. The `.in(status,...)` guard makes this idempotent — a
  // finished/failed row is left untouched.
  let update = adminClient
    .from('story_renders')
    .update({ status: 'failed', error_message: 'cancelled by user' })
    .eq('gallery_id', galleryId)
    .eq('style', STUDIO_STYLE)
    .in('status', ['queued', 'rendering'])
  if (renderId) update = update.eq('id', renderId)
  const { data: cancelled, error: updErr } = await update.select('id, status')
  if (updErr) {
    console.error('[stories/cancel] update failed', updErr.message)
    return res.status(500).json({ ok: false, error: 'cancel_failed' })
  }

  return res.status(200).json({
    ok: true,
    cancelled: (cancelled?.length ?? 0) > 0,
    status: 'failed',
  })
}

export default withSentry('stories/cancel', handler)
