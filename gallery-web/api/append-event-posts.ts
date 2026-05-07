// append-event-posts.ts — multi-action service-role write surface for feed_plans.
//
// Public client dashboards run with the Supabase anon key, but RLS forbids
// anon UPDATE on feed_plans, so direct writes silently no-op. This endpoint
// runs with service-role credentials and exposes 4 dispatchable actions:
//
//   1. action: 'append_event_posts' (DEFAULT) — append AI-suggested posts
//      from /api/plan-event into the active feed_plan.
//   2. action: 'choose_variant'   — set chosen_variant_id, apply default
//      schedule (Mon/Wed/Fri 19:00 IST starting next Monday), set
//      status='accepted', stamp accepted_at.
//   3. action: 'unchoose_variant' — clear chosen_variant_id, set
//      status='draft', clear accepted_at.
//   4. action: 'save_post_edit'   — persist a single edited post inside
//      the given variant (find-by-id, replace).
//
// All write actions FIRST verify ownership: the clientId must match the
// plan's client_id, and the client must exist. Service-role bypasses RLS,
// so the dispatcher itself enforces the access boundary.
//
// We stay within Vercel's 12-function cap by routing all four behaviors
// through this single endpoint via body.action.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 60

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

// ── Origin allowlist guard (Phase 1.B) ──────────────────────────────────
// Allow same-origin (no Origin header on server-to-server, browsers send it),
// production deployment, all *.vercel.app preview deployments, and localhost
// dev. Reject everything else with 403.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true // server-to-server / curl with no Origin
  try {
    const u = new URL(origin)
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.vercel.app')) return true
    if (host === 'pixflow.co.il' || host.endsWith('.pixflow.co.il')) return true
    if (host === 'eclipsemedia.co.il' || host.endsWith('.eclipsemedia.co.il')) return true
    return false
  } catch {
    return false
  }
}

// ── Shared types ────────────────────────────────────────────────────────

type PostFormat = 'single' | 'carousel' | 'story' | 'reel_cover' | 'text_slide'
type PostStatus = 'draft' | 'scheduled' | 'published'

interface Crop { aspect: '1:1' | '4:5' | '9:16'; focalX: number; focalY: number }

interface BasePersistedPost {
  id: string
  position?: number | null
  format: PostFormat
  source_gallery_id: string | null
  reasoning?: string
  scheduled_at?: string
  status?: PostStatus
}
interface PersistedSingle extends BasePersistedPost {
  format: 'single'; image_id: string; caption: string; crop?: Crop
}
interface PersistedCarousel extends BasePersistedPost {
  format: 'carousel'; image_ids: string[]; opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  crops?: Record<string, Crop>
}
interface PersistedStory extends BasePersistedPost {
  format: 'story'; image_ids: string[]
  slide_meta: Array<{ image_id: string; overlay_text?: string; sticker?: string }>
  crops?: Record<string, Crop>
}
interface PersistedReel extends BasePersistedPost {
  format: 'reel_cover'; image_id: string; hook_text: string; caption: string; crop?: Crop
}
interface PersistedText extends BasePersistedPost {
  format: 'text_slide'; image_id: null; headline: string; sub: string
  background_color: string; text_color: string
}
type PersistedPost =
  | PersistedSingle | PersistedCarousel | PersistedStory | PersistedReel | PersistedText

interface PersistedVariant {
  id: string; label: string; tagline: string; rationale: string
  posts: PersistedPost[]
}

interface FeedPlanPosts {
  brief?: unknown
  variants?: PersistedVariant[]
  chosen_variant_id?: string
}

// ── append_event_posts incoming shape (legacy / default action) ─────────

interface IncomingSingle {
  id: string; format: 'single'
  source_gallery_id: string; image_id: string
  caption: string; reasoning: string
  suggested_schedule_offset_days: number
}
interface IncomingCarousel {
  id: string; format: 'carousel'
  source_gallery_id: string; image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  reasoning: string
  suggested_schedule_offset_days: number
}
type IncomingPost = IncomingSingle | IncomingCarousel

interface AppendBody {
  action?: 'append_event_posts'
  clientId?: string
  posts?: IncomingPost[]
}

interface ChooseVariantBody {
  action: 'choose_variant'
  clientId?: string
  planId?: string
  variantId?: string
}
interface UnchooseVariantBody {
  action: 'unchoose_variant'
  clientId?: string
  planId?: string
}
interface SavePostEditBody {
  action: 'save_post_edit'
  clientId?: string
  planId?: string
  variantId?: string
  post?: PersistedPost
}
type ActionBody = AppendBody | ChooseVariantBody | UnchooseVariantBody | SavePostEditBody

// ── Helpers ─────────────────────────────────────────────────────────────

function offsetToIso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(19, 0, 0, 0)
  return d.toISOString()
}

// Mirror of FeedStudio.tsx::getDefaultSchedule — Mon/Wed/Fri 19:00 starting
// next Monday. Returns ISO strings, one per post.
function getDefaultSchedule(count: number): string[] {
  const out: string[] = []
  const now = new Date()
  const daysUntilMon = (8 - now.getDay()) % 7 || 7
  const start = new Date(now)
  start.setDate(now.getDate() + daysUntilMon)
  start.setHours(19, 0, 0, 0)
  const dayOffsets = [0, 2, 4]
  for (let i = 0; i < count; i++) {
    const week = Math.floor(i / 3)
    const dayOff = dayOffsets[i % 3]
    const dt = new Date(start)
    dt.setDate(start.getDate() + week * 7 + dayOff)
    out.push(dt.toISOString())
  }
  return out
}

// Mirror of FeedStudio.tsx::applyDefaultsToVariant. Sorts by `position` then
// fills in scheduled_at + status='draft' on every post that doesn't have one.
// Also sets a default crop {aspect:'1:1', focalX:0.5, focalY:0.5} on formats
// that use a single crop (single, reel_cover) when missing.
function applyDefaultsToVariant(v: PersistedVariant): PersistedVariant {
  const sorted = v.posts.slice().sort((a, b) => {
    const pa = a.position ?? 999
    const pb = b.position ?? 999
    return pa - pb
  })
  const sched = getDefaultSchedule(sorted.length)
  const defaultCrop: Crop = { aspect: '1:1', focalX: 0.5, focalY: 0.5 }
  return {
    ...v,
    posts: sorted.map((p, i) => {
      const base: PersistedPost = {
        ...p,
        scheduled_at: p.scheduled_at ?? sched[i],
        status: p.status ?? 'draft',
      } as PersistedPost
      if (base.format === 'single' || base.format === 'reel_cover') {
        if (!base.crop) (base as PersistedSingle | PersistedReel).crop = { ...defaultCrop }
      }
      return base
    }),
  }
}

// Verify {clientId, planId} ownership. Returns the plan row on success, or
// an error tuple `[status, code, detail?]` on failure.
async function verifyOwnership(
  clientId: string,
  planId: string,
): Promise<
  | { ok: true; plan: { id: string; client_id: string; posts: FeedPlanPosts | null; status: string; created_at: string } }
  | { ok: false; status: number; code: string; detail?: string }
> {
  if (!supabase) return { ok: false, status: 500, code: 'supabase_not_configured' }

  const { data: client, error: cliErr } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (cliErr) return { ok: false, status: 500, code: 'client_lookup_failed', detail: cliErr.message?.slice(0, 200) }
  if (!client) return { ok: false, status: 404, code: 'client_not_found' }

  const { data: plan, error: planErr } = await supabase
    .from('feed_plans')
    .select('id, client_id, posts, status, created_at')
    .eq('id', planId)
    .maybeSingle()
  if (planErr) return { ok: false, status: 500, code: 'plan_lookup_failed', detail: planErr.message?.slice(0, 200) }
  if (!plan) return { ok: false, status: 404, code: 'plan_not_found' }
  if (plan.client_id !== clientId) return { ok: false, status: 403, code: 'plan_ownership_mismatch' }

  return {
    ok: true,
    plan: {
      id: plan.id,
      client_id: plan.client_id,
      posts: (plan.posts ?? null) as FeedPlanPosts | null,
      status: plan.status as string,
      created_at: plan.created_at as string,
    },
  }
}

// ── Action: append_event_posts (DEFAULT, legacy) ────────────────────────

async function handleAppendEventPosts(
  body: AppendBody,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const clientId = String(body.clientId ?? '').trim()
  const incoming = Array.isArray(body.posts) ? body.posts : []
  if (!clientId) { res.status(400).json({ ok: false, error: 'clientId_required' }); return }
  if (incoming.length === 0) { res.status(400).json({ ok: false, error: 'posts_required' }); return }

  for (const p of incoming) {
    if (p.format === 'single') {
      if (!p.image_id || !p.caption || !p.source_gallery_id) {
        res.status(400).json({ ok: false, error: 'invalid_single_post' }); return
      }
    } else if (p.format === 'carousel') {
      if (!Array.isArray(p.image_ids) || p.image_ids.length < 2 || !p.opening_caption) {
        res.status(400).json({ ok: false, error: 'invalid_carousel_post' }); return
      }
    } else {
      res.status(400).json({ ok: false, error: 'unsupported_format' }); return
    }
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) { res.status(404).json({ ok: false, error: 'client_not_found' }); return }

  const persistedPosts: PersistedPost[] = incoming.map(p => {
    const offset = Math.max(1, Math.min(60, Number(p.suggested_schedule_offset_days || 3)))
    const scheduled_at = offsetToIso(offset)
    if (p.format === 'single') {
      return {
        id: p.id, format: 'single', position: null,
        source_gallery_id: p.source_gallery_id,
        image_id: p.image_id,
        caption: p.caption,
        reasoning: p.reasoning ?? '',
        scheduled_at, status: 'draft',
      }
    }
    return {
      id: p.id, format: 'carousel', position: null,
      source_gallery_id: p.source_gallery_id,
      image_ids: p.image_ids,
      opening_caption: p.opening_caption,
      slide_captions: p.slide_captions ?? [],
      reasoning: p.reasoning ?? '',
      scheduled_at, status: 'draft',
    }
  })

  const { data: latest } = await supabase
    .from('feed_plans')
    .select('id, posts, status, source_gallery_ids')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    const { data: created, error: insErr } = await supabase
      .from('feed_plans')
      .insert({
        business_id: client.business_id,
        client_id: clientId,
        source_gallery_ids: Array.from(new Set(persistedPosts.map(p => p.source_gallery_id))),
        style: 'color_block_editorial',
        posts: {
          variants: [{
            id: 'rolling',
            label: 'הפיד הרציף',
            tagline: 'תכנון שבועי לפי אירוע',
            rationale: 'נבנה אירוע אחר אירוע, AI מציע פוסטים שמתאימים לסגנון הקיים.',
            posts: persistedPosts,
          }],
          chosen_variant_id: 'rolling',
        } as FeedPlanPosts,
        brand_snapshot: { mode: 'rolling' },
        llm_trace: { source: 'plan-event' },
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr || !created) {
      res.status(500).json({ ok: false, error: 'insert_failed', detail: insErr?.message?.slice(0, 200) }); return
    }
    res.status(200).json({
      ok: true,
      plan_id: created.id,
      added_post_ids: persistedPosts.map(p => p.id),
      mode: 'created_rolling',
    })
    return
  }

  const cur = (latest.posts ?? {}) as FeedPlanPosts
  const variants = cur.variants ? [...cur.variants] : []
  const chosenId = cur.chosen_variant_id ?? null

  let targetIdx = -1
  if (chosenId) targetIdx = variants.findIndex(v => v.id === chosenId)
  if (targetIdx === -1) {
    targetIdx = variants.findIndex(v => v.id === 'rolling')
    if (targetIdx === -1) {
      variants.push({
        id: 'rolling',
        label: 'הפיד הרציף',
        tagline: 'תכנון שבועי לפי אירוע',
        rationale: 'נבנה אירוע אחר אירוע.',
        posts: [],
      })
      targetIdx = variants.length - 1
    }
  }

  variants[targetIdx] = {
    ...variants[targetIdx],
    posts: [...variants[targetIdx].posts, ...persistedPosts],
  }

  const newPostsField: FeedPlanPosts = {
    ...cur,
    variants,
    chosen_variant_id: chosenId ?? variants[targetIdx].id,
  }

  const existingSrc = (latest.source_gallery_ids ?? []) as string[]
  const newSrcSet = new Set<string>(existingSrc)
  for (const p of persistedPosts) {
    if (p.source_gallery_id) newSrcSet.add(p.source_gallery_id)
  }

  const { error: upErr } = await supabase
    .from('feed_plans')
    .update({
      posts: newPostsField,
      source_gallery_ids: Array.from(newSrcSet),
      status: 'accepted',
      accepted_at: latest.status === 'accepted' ? undefined : new Date().toISOString(),
    })
    .eq('id', latest.id)
  if (upErr) {
    res.status(500).json({ ok: false, error: 'update_failed', detail: upErr.message.slice(0, 200) }); return
  }

  res.status(200).json({
    ok: true,
    plan_id: latest.id,
    added_post_ids: persistedPosts.map(p => p.id),
    mode: 'appended',
  })
}

// ── Action: choose_variant ──────────────────────────────────────────────

async function handleChooseVariant(
  body: ChooseVariantBody,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const clientId = String(body.clientId ?? '').trim()
  const planId = String(body.planId ?? '').trim()
  const variantId = String(body.variantId ?? '').trim()
  if (!clientId) { res.status(400).json({ ok: false, error: 'clientId_required' }); return }
  if (!planId)   { res.status(400).json({ ok: false, error: 'planId_required' });   return }
  if (!variantId){ res.status(400).json({ ok: false, error: 'variantId_required' }); return }

  const own = await verifyOwnership(clientId, planId)
  if (!own.ok) { res.status(own.status).json({ ok: false, error: own.code, detail: own.detail }); return }

  const cur = (own.plan.posts ?? {}) as FeedPlanPosts
  const variants = cur.variants ? [...cur.variants] : []
  const idx = variants.findIndex(v => v.id === variantId)
  if (idx === -1) { res.status(400).json({ ok: false, error: 'variant_not_found' }); return }

  variants[idx] = applyDefaultsToVariant(variants[idx])

  const newField: FeedPlanPosts = {
    ...cur,
    variants,
    chosen_variant_id: variantId,
  }

  const acceptedAt = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('feed_plans')
    .update({ posts: newField, status: 'accepted', accepted_at: acceptedAt })
    .eq('id', planId)
  if (upErr) {
    res.status(500).json({ ok: false, error: 'update_failed', detail: upErr.message?.slice(0, 200) }); return
  }

  res.status(200).json({
    ok: true,
    plan: {
      id: own.plan.id,
      posts: newField,
      status: 'accepted',
      created_at: own.plan.created_at,
    },
  })
}

// ── Action: unchoose_variant ────────────────────────────────────────────

async function handleUnchooseVariant(
  body: UnchooseVariantBody,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const clientId = String(body.clientId ?? '').trim()
  const planId = String(body.planId ?? '').trim()
  if (!clientId) { res.status(400).json({ ok: false, error: 'clientId_required' }); return }
  if (!planId)   { res.status(400).json({ ok: false, error: 'planId_required' });   return }

  const own = await verifyOwnership(clientId, planId)
  if (!own.ok) { res.status(own.status).json({ ok: false, error: own.code, detail: own.detail }); return }

  const cur = (own.plan.posts ?? {}) as FeedPlanPosts
  const newField: FeedPlanPosts = { ...cur, chosen_variant_id: undefined }

  const { error: upErr } = await supabase
    .from('feed_plans')
    .update({ posts: newField, status: 'draft', accepted_at: null })
    .eq('id', planId)
  if (upErr) {
    res.status(500).json({ ok: false, error: 'update_failed', detail: upErr.message?.slice(0, 200) }); return
  }

  res.status(200).json({
    ok: true,
    plan: {
      id: own.plan.id,
      posts: newField,
      status: 'draft',
      created_at: own.plan.created_at,
    },
  })
}

// ── Action: save_post_edit ──────────────────────────────────────────────

function isPersistedPost(x: unknown): x is PersistedPost {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return false
  const f = o.format
  return f === 'single' || f === 'carousel' || f === 'story'
      || f === 'reel_cover' || f === 'text_slide'
}

async function handleSavePostEdit(
  body: SavePostEditBody,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const clientId = String(body.clientId ?? '').trim()
  const planId = String(body.planId ?? '').trim()
  const variantId = String(body.variantId ?? '').trim()
  const incomingPost = body.post
  if (!clientId)  { res.status(400).json({ ok: false, error: 'clientId_required' });  return }
  if (!planId)    { res.status(400).json({ ok: false, error: 'planId_required' });    return }
  if (!variantId) { res.status(400).json({ ok: false, error: 'variantId_required' }); return }
  if (!isPersistedPost(incomingPost)) {
    res.status(400).json({ ok: false, error: 'invalid_post' }); return
  }

  const own = await verifyOwnership(clientId, planId)
  if (!own.ok) { res.status(own.status).json({ ok: false, error: own.code, detail: own.detail }); return }

  // Re-read + merge in-memory to avoid stale-write losing concurrent edits.
  const cur = (own.plan.posts ?? {}) as FeedPlanPosts
  const variants = cur.variants ? [...cur.variants] : []
  const vIdx = variants.findIndex(v => v.id === variantId)
  if (vIdx === -1) { res.status(400).json({ ok: false, error: 'variant_not_found' }); return }

  const variant = variants[vIdx]
  const pIdx = variant.posts.findIndex(p => p.id === incomingPost.id)
  if (pIdx === -1) { res.status(400).json({ ok: false, error: 'post_not_found' }); return }

  const newPosts = variant.posts.slice()
  newPosts[pIdx] = incomingPost
  variants[vIdx] = { ...variant, posts: newPosts }

  const newField: FeedPlanPosts = { ...cur, variants }

  const { error: upErr } = await supabase
    .from('feed_plans')
    .update({ posts: newField })
    .eq('id', planId)
  if (upErr) {
    res.status(500).json({ ok: false, error: 'update_failed', detail: upErr.message?.slice(0, 200) }); return
  }

  res.status(200).json({
    ok: true,
    plan: {
      id: own.plan.id,
      posts: newField,
      status: own.plan.status,
      created_at: own.plan.created_at,
    },
  })
}

// ── Dispatcher ──────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
  }
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  const body = (req.body || {}) as ActionBody
  const action = (body as { action?: string }).action

  if (action === 'append_event_posts' || !action) {
    await handleAppendEventPosts(body as AppendBody, res); return
  }
  if (action === 'choose_variant') {
    await handleChooseVariant(body as ChooseVariantBody, res); return
  }
  if (action === 'unchoose_variant') {
    await handleUnchooseVariant(body as UnchooseVariantBody, res); return
  }
  if (action === 'save_post_edit') {
    await handleSavePostEdit(body as SavePostEditBody, res); return
  }

  return res.status(400).json({ ok: false, error: 'unknown_action', detail: String(action) })
}
