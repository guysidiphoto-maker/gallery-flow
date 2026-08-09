// api/stories/draft.ts — Story Studio draft persistence (owner-only).
//
//   GET  /api/stories/draft?galleryId=<uuid>   -> { scenePlan | null, title }
//   PUT  /api/stories/draft { galleryId, scenePlan, title? } -> { ok, savedAt }
//
// Autosave from the editor lands here. Writes go through the SERVICE ROLE after
// verifying the caller owns the gallery — identical trust model to
// /api/stories/render (no anon/authenticated UPDATE policy exists on
// story_renders; only this verified endpoint mutates rows). The submitted plan
// is validated + hardened by resolveAndValidatePlan (tenant isolation, no
// foreign images, no markup injection) before it is stored.
//
// DB DEPENDENCY (unresolved by design): needs the additive columns
//   story_renders.scene_plan (jsonb), .title (text), .draft_updated_at (tstz),
//   the 'draft' status value, and the one-draft-per-gallery partial-unique index
// from docs/story-studio/provisional-migration/. That migration is NOT applied
// to any shared environment yet, so this endpoint is wired + typechecked but not
// live until the migration lands (see MIGRATION-INVENTORY-AND-COLLISION-PROOF).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import {
  resolveAndValidatePlan,
  stripForPersistence,
  type OwnerImage,
} from './_scenePlanGuard.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

interface OwnerCtx {
  adminClient: SupabaseClient
  userId: string
}

/** Verify the bearer token owns the gallery. Returns null (and writes the
 *  response) on any failure so callers can early-return. */
async function authorizeOwner(
  req: VercelRequest,
  res: VercelResponse,
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
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server_misconfigured' })
    return
  }

  if (req.method === 'GET') {
    const galleryId = String(req.query.galleryId || '')
    if (!galleryId) {
      res.status(400).json({ error: 'missing_gallery_id' })
      return
    }
    const ctx = await authorizeOwner(req, res, galleryId)
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
    if (!galleryId) {
      res.status(400).json({ error: 'missing_gallery_id' })
      return
    }
    if (!body.scenePlan || typeof body.scenePlan !== 'object') {
      res.status(400).json({ error: 'missing_scene_plan' })
      return
    }
    const ctx = await authorizeOwner(req, res, galleryId)
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

    // One draft per gallery. The partial-unique index (WHERE status='draft')
    // can't back a plain ON CONFLICT, so replace explicitly: delete the existing
    // draft, then insert. (Owner-scoped; safe under the single-writer endpoint.)
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
      res.status(500).json({ error: 'draft_write_failed', message: upErr.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET, PUT')
  res.status(405).json({ error: 'method_not_allowed' })
}

export default withSentry('stories/draft', handler)
