// Cooperative cancel: a synchronous render can't be killed, so this flips the
// row to 'failed' ('cancelled by user'; there is no 'cancelled' status) and the
// render discards its output when it sees the row is no longer 'rendering'.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../server/env.js'
import { serviceClient } from '../../server/supabase.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STUDIO_STYLE = 'studio'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  const adminClient = serviceClient()
  if (!adminClient) {
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

  // Without a renderId, cancel whatever studio render is in flight. The status
  // guard leaves finished rows untouched, so this is idempotent.
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
