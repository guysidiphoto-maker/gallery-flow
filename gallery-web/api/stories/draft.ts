// Story Studio draft autosave (GET/PUT, owner-only). Writes go through the
// service role after an owner check, and the plan is re-validated by
// resolveAndValidatePlan before storage (tenant isolation, no injection).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../server/env.js'
import { serviceClient } from '../../server/supabase.js'
import {
  resolveAndValidatePlan,
  stripForPersistence,
  type OwnerImage,
} from './_scenePlanGuard.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface OwnerCtx {
  adminClient: SupabaseClient
  userId: string
}

/** Verify the bearer token owns the gallery. Returns null (and writes the
 *  response) on any failure so callers can early-return. */
async function authorizeOwner(
  req: VercelRequest,
  res: VercelResponse,
  adminClient: SupabaseClient,
  galleryId: string,
): Promise<OwnerCtx | null> {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  const { data: gallery, error: gErr } = await adminClient
    .from('galleries')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', galleryId)
    .single()
  if (gErr || !gallery) {
    res.status(404).json({ error: 'gallery_not_found' })
    return null
  }
  const biz = (gallery as { businesses?: { user_id?: string } | { user_id?: string }[] }).businesses
  const ownerId = Array.isArray(biz) ? biz[0]?.user_id : biz?.user_id
  if (ownerId !== userData.user.id) {
    res.status(403).json({ error: 'not_owner' })
    return null
  }
  return { adminClient, userId: userData.user.id }
}

async function loadOwnerImages(admin: SupabaseClient, galleryId: string): Promise<{
  images: OwnerImage[]
  pathById: Map<string, string>
}> {
  const { data, error } = await admin
    .from('images')
    .select('id, width, height, web_preview_path, original_path')
    .eq('gallery_id', galleryId)
  if (error) throw new Error(`image_lookup_failed: ${error.message}`)
  const rows = (data || []) as Array<{
    id: string
    width?: number | null
    height?: number | null
    web_preview_path?: string | null
    original_path?: string | null
  }>
  const images: OwnerImage[] = rows.map((r) => ({ id: r.id, width: r.width, height: r.height }))
  const pathById = new Map<string, string>()
  for (const r of rows) {
    const p = r.web_preview_path || r.original_path || ''
    if (p) pathById.set(r.id, p)
  }
  return { images, pathById }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const adminClient = serviceClient()
  if (!adminClient) {
    res.status(500).json({ error: 'server_misconfigured' })
    return
  }

  if (req.method === 'GET') {
    const galleryId = String(req.query.galleryId || '')
    if (!galleryId || !UUID_RE.test(galleryId)) {
      res.status(400).json({ error: 'invalid_gallery_id' })
      return
    }
    const ctx = await authorizeOwner(req, res, adminClient, galleryId)
    if (!ctx) return
    const { data, error } = await ctx.adminClient
      .from('story_renders')
      .select('scene_plan, title, draft_updated_at')
      .eq('gallery_id', galleryId)
      .eq('status', 'draft')
      .maybeSingle()
    if (error) {
      res.status(500).json({ error: 'draft_read_failed' })
      return
    }
    res.status(200).json({
      scenePlan: data?.scene_plan ?? null,
      title: data?.title ?? null,
      savedAt: data?.draft_updated_at ?? null,
    })
    return
  }

  if (req.method === 'PUT') {
    const body = (req.body || {}) as { galleryId?: unknown; scenePlan?: unknown; title?: unknown }
    const galleryId = typeof body.galleryId === 'string' ? body.galleryId : ''
    if (!galleryId || !UUID_RE.test(galleryId)) {
      res.status(400).json({ error: 'invalid_gallery_id' })
      return
    }
    if (!body.scenePlan || typeof body.scenePlan !== 'object') {
      res.status(400).json({ error: 'missing_scene_plan' })
      return
    }
    const ctx = await authorizeOwner(req, res, adminClient, galleryId)
    if (!ctx) return

    const { images } = await loadOwnerImages(ctx.adminClient, galleryId)
    // Validate + tenant-isolate. src doesn't matter for a draft, but this is
    // where foreign-image / injection / range attacks are rejected.
    const result = resolveAndValidatePlan(body.scenePlan, galleryId, images, (id) => id)
    if (!result.ok) {
      res.status(400).json({ error: 'invalid_scene_plan', details: result.errors })
      return
    }

    const toStore = stripForPersistence(result.plan)
    const title = typeof body.title === 'string' ? body.title.slice(0, 120) : null

    // One draft per gallery; a partial-unique index can't back ON CONFLICT,
    // so delete then insert.
    await ctx.adminClient
      .from('story_renders')
      .delete()
      .eq('gallery_id', galleryId)
      .eq('status', 'draft')
    const { error: upErr } = await ctx.adminClient.from('story_renders').insert({
      gallery_id: galleryId,
      status: 'draft',
      style: toStore.template,
      scene_plan: toStore,
      title,
      requested_by: ctx.userId,
      draft_updated_at: new Date().toISOString(),
    })
    if (upErr) {
      console.error('[stories/draft] write failed', upErr.message)
      res.status(500).json({ error: 'draft_write_failed' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET, PUT')
  res.status(405).json({ error: 'method_not_allowed' })
}

export default withSentry('stories/draft', handler)
