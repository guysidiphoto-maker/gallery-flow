// append-event-posts.ts — commit endpoint for per-event suggestions.
//
// After the photographer approves AI suggestions from /api/plan-event, this
// endpoint persists them into the client's active feed_plan. It runs with
// service-role credentials so anon callers (the public client dashboard)
// can write through it without needing direct UPDATE rights on feed_plans.
//
// Logic:
//   1. Find or create the client's active feed_plan.
//      - If no plan exists yet → create one with an implicit "rolling"
//        variant and chosen_variant_id pre-set, status='accepted'.
//      - If a plan exists with chosen_variant_id → append to that variant.
//      - If plan exists but no variant chosen → append to a "rolling"
//        variant (auto-create if missing) and set chosen_variant_id.
//   2. Each new post gets:
//      - scheduled_at = now + suggested_schedule_offset_days at 19:00 IST
//      - status = 'draft'
//   3. Returns the updated plan id + new post ids.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

interface IncomingSingle {
  id: string
  format: 'single'
  source_gallery_id: string
  image_id: string
  caption: string
  reasoning: string
  suggested_schedule_offset_days: number
}
interface IncomingCarousel {
  id: string
  format: 'carousel'
  source_gallery_id: string
  image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  reasoning: string
  suggested_schedule_offset_days: number
}
type IncomingPost = IncomingSingle | IncomingCarousel

interface AppendBody {
  clientId?: string
  posts?: IncomingPost[]
}

interface PersistedSingle {
  id: string
  format: 'single'
  position: null
  source_gallery_id: string
  image_id: string
  caption: string
  reasoning: string
  scheduled_at: string
  status: 'draft'
}
interface PersistedCarousel {
  id: string
  format: 'carousel'
  position: null
  source_gallery_id: string
  image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  reasoning: string
  scheduled_at: string
  status: 'draft'
}
type PersistedPost = PersistedSingle | PersistedCarousel

interface FeedPlanPosts {
  brief?: unknown
  variants?: Array<{ id: string; label: string; tagline: string; rationale: string; posts: PersistedPost[] }>
  chosen_variant_id?: string
}

function offsetToIso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(19, 0, 0, 0)   // 19:00 IST default
  return d.toISOString()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (!supabase) return res.status(500).json({ ok: false, error: 'supabase_not_configured' })

  const body = (req.body || {}) as AppendBody
  const clientId = String(body.clientId ?? '').trim()
  const incoming = Array.isArray(body.posts) ? body.posts : []
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' })
  if (incoming.length === 0)
    return res.status(400).json({ ok: false, error: 'posts_required' })

  // Validate the basics on each incoming post.
  for (const p of incoming) {
    if (p.format === 'single') {
      if (!p.image_id || !p.caption || !p.source_gallery_id)
        return res.status(400).json({ ok: false, error: 'invalid_single_post' })
    } else if (p.format === 'carousel') {
      if (!Array.isArray(p.image_ids) || p.image_ids.length < 2 || !p.opening_caption)
        return res.status(400).json({ ok: false, error: 'invalid_carousel_post' })
    } else {
      return res.status(400).json({ ok: false, error: 'unsupported_format' })
    }
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' })

  // Build the persisted-shape posts.
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

  // Find latest feed_plan for this client.
  const { data: latest } = await supabase
    .from('feed_plans')
    .select('id, posts, status, source_gallery_ids')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    // No plan yet — create one with an implicit "rolling" variant.
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
    if (insErr || !created)
      return res.status(500).json({ ok: false, error: 'insert_failed', detail: insErr?.message?.slice(0, 200) })
    return res.status(200).json({
      ok: true,
      plan_id: created.id,
      added_post_ids: persistedPosts.map(p => p.id),
      mode: 'created_rolling',
    })
  }

  // Plan exists — append to the chosen variant (or "rolling", auto-create).
  const cur = (latest.posts ?? {}) as FeedPlanPosts
  const variants = cur.variants ? [...cur.variants] : []
  const chosenId = cur.chosen_variant_id ?? null

  let targetIdx = -1
  if (chosenId) targetIdx = variants.findIndex(v => v.id === chosenId)
  if (targetIdx === -1) {
    // No chosen variant → create or use existing "rolling" variant.
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

  // Merge source_gallery_ids in case this event introduces a new one.
  const existingSrc = (latest.source_gallery_ids ?? []) as string[]
  const newSrcSet = new Set<string>(existingSrc)
  for (const p of persistedPosts) newSrcSet.add(p.source_gallery_id)

  const { error: upErr } = await supabase
    .from('feed_plans')
    .update({
      posts: newPostsField,
      source_gallery_ids: Array.from(newSrcSet),
      status: 'accepted',
      accepted_at: latest.status === 'accepted' ? undefined : new Date().toISOString(),
    })
    .eq('id', latest.id)
  if (upErr)
    return res.status(500).json({ ok: false, error: 'update_failed', detail: upErr.message.slice(0, 200) })

  return res.status(200).json({
    ok: true,
    plan_id: latest.id,
    added_post_ids: persistedPosts.map(p => p.id),
    mode: 'appended',
  })
}
