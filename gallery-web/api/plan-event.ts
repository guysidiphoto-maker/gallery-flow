// plan-event.ts — per-event AI post planner.
//
// Given a single gallery (one event), this endpoint:
//   1. Pulls its top picks (is_top_pick=true, hard founder rule)
//   2. Joins them with image_ai_scores (already cached, or scored on demand
//      by the score-images endpoint that the frontend can call first)
//   3. Reads the active feed_plan to see what's already scheduled, so the
//      AI can suggest posts that FIT visually & narratively into the
//      rolling schedule (no two carousels in a row, alternate close-up
//      vs wide, color rhythm)
//   4. Single Claude Sonnet call returning 2–3 post suggestions
//   5. Returns suggestions WITHOUT persisting — frontend approval is the
//      gate. Approval-side endpoint (/api/append-event-posts) commits.
//
// Cost: ~$0.05–0.10 per event (one Sonnet call, ~10 photos worth of metadata,
// no vision calls inside this endpoint).

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const POST_FORMATS = ['single', 'carousel'] as const
type PostFormat = typeof POST_FORMATS[number]

interface PlanEventBody {
  clientId?: string
  galleryId?: string
  count?: number    // 1..3, default 2
}

interface RawSingle {
  format: 'single'
  image_index: number
  caption: string
  reasoning: string
  suggested_schedule_offset_days?: number
}
interface RawCarousel {
  format: 'carousel'
  image_indexes: number[]
  opening_caption: string
  slide_captions: Array<{ image_index: number; caption: string }>
  reasoning: string
  suggested_schedule_offset_days?: number
}
type RawSuggestion = RawSingle | RawCarousel

interface ResolvedSingle {
  id: string
  format: 'single'
  position: null
  source_gallery_id: string
  image_id: string
  caption: string
  reasoning: string
  suggested_schedule_offset_days: number
}
interface ResolvedCarousel {
  id: string
  format: 'carousel'
  position: null
  source_gallery_id: string
  image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  reasoning: string
  suggested_schedule_offset_days: number
}
type ResolvedSuggestion = ResolvedSingle | ResolvedCarousel

interface ScoredPhoto {
  image_id: string
  filename: string
  hero_score?: number
  carousel_score?: number
  story_score?: number
  atmosphere_score?: number
  people_density?: number
  brand_fit?: number
  social_potential?: number
  suggested_usage?: string
  rationale_he?: string
  focal_x?: number
  focal_y?: number
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return 'p_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function buildSystemPrompt(): string {
  return `You are a senior Israeli social-media creative director planning weekly Instagram posts for a production-company brand. The photographer just delivered ONE new event. Your job: suggest 1–3 posts for THIS event that fit into the rolling feed schedule — same brand voice, same visual rhythm, no two carousels back-to-back.

You will be given:
- The brand & client context
- The list of top-pick photos from this NEW event (with AI scores per image)
- A summary of the LAST 6 already-scheduled posts (formats, captions, source events) so you understand the rolling rhythm

Output 1–3 post suggestions. Mix formats by score:
- Use "single" when one photo is the clear hero (hero_score ≥ 7, or strongest in batch). Caption 8–14 Hebrew words.
- Use "carousel" (3–5 slides) when several photos tell a story together. Opening caption 8–14 Hebrew words; per-slide captions 4–10 Hebrew words.
- Don't propose a carousel if the previous scheduled post was a carousel — alternate.
- If the event has fewer than 3 strong photos, suggest just 1 post.

Each suggestion includes:
- format: "single" | "carousel"
- image_index (single) or image_indexes (carousel) — INTEGERS from the photo list (1..N). Never invent UUIDs.
- caption / opening_caption + slide_captions
- reasoning: one Hebrew sentence — why this photo set, why this format, how it fits the rolling rhythm
- suggested_schedule_offset_days: when to post (1 = tomorrow, 3 = three days from now, 7 = next week). Pick gaps in the existing schedule. Mon/Wed/Fri evenings are preferred slots if free.

Hebrew style:
- Editorial, present-tense, sensorial. Like top Israeli production-company accounts.
- No hashtags, no emojis, no clichés ("רגע מיוחד", "אירוע מושלם").
- Reference the event's specific atmosphere when possible (e.g., "פתיחת מתחם", "כנס", "כנס פנים").

Output STRICT JSON only — no preamble, no markdown:
{
  "suggestions": [
    { "format": "single", "image_index": 3, "caption": "...", "reasoning": "...", "suggested_schedule_offset_days": 2 },
    { "format": "carousel", "image_indexes": [1, 5, 8], "opening_caption": "...", "slide_captions": [{"image_index": 1, "caption":"..."}, ...], "reasoning": "...", "suggested_schedule_offset_days": 7 }
  ]
}`
}

function buildUserMessage(opts: {
  businessName: string
  clientName: string
  galleryName: string
  photos: ScoredPhoto[]
  recentScheduled: Array<{ format: string; caption: string; source_gallery: string; days_from_now: number }>
}): string {
  const photoLines = opts.photos
    .map((p, i) => {
      const score = p.hero_score !== undefined
        ? ` · usage=${p.suggested_usage} hero=${p.hero_score} carousel=${p.carousel_score} atmo=${p.atmosphere_score} people=${p.people_density} brand=${p.brand_fit} social=${p.social_potential}`
        : ' · (not yet scored — use file name as weak signal)'
      const rationale = p.rationale_he ? ` · "${p.rationale_he}"` : ''
      return `[${i + 1}] file="${p.filename}"${score}${rationale}`
    })
    .join('\n')

  const scheduleLines = opts.recentScheduled.length === 0
    ? '(no scheduled posts yet — this is the first event being planned)'
    : opts.recentScheduled
        .map((s, i) => `${i + 1}. T+${s.days_from_now}d · ${s.format} · "${s.caption}" · from "${s.source_gallery}"`)
        .join('\n')

  return `Brand: ${opts.businessName} (Israeli production-company photographer)
Client: ${opts.clientName}
NEW EVENT to plan: "${opts.galleryName}"

PHOTOS FROM THIS NEW EVENT (${opts.photos.length} top picks; reference by bracketed index):
${photoLines}

RECENTLY SCHEDULED POSTS (so you can fit new posts into the rolling rhythm):
${scheduleLines}

Suggest 1–3 posts for the new event. Output strict JSON only.`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (!supabase) return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'anthropic_not_configured' })

  const body = (req.body || {}) as PlanEventBody
  const clientId = String(body.clientId ?? '').trim()
  const galleryId = String(body.galleryId ?? '').trim()
  if (!clientId || !galleryId)
    return res.status(400).json({ ok: false, error: 'clientId_and_galleryId_required' })
  const requestedCount = Math.max(1, Math.min(3, Number(body.count ?? 2)))

  // Fetch client + business + gallery (verify ownership).
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, business_name')
    .eq('id', client.business_id)
    .maybeSingle()
  if (!business) return res.status(404).json({ ok: false, error: 'business_not_found' })

  const { data: gallery } = await supabase
    .from('galleries')
    .select('id, name, client_id, status')
    .eq('id', galleryId)
    .maybeSingle()
  if (!gallery) return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  if (gallery.client_id !== clientId)
    return res.status(403).json({ ok: false, error: 'gallery_not_owned_by_client' })

  // Top picks for THIS gallery only.
  const { data: picks } = await supabase
    .from('images')
    .select('id, filename')
    .eq('gallery_id', galleryId)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(20)
  if (!picks || picks.length === 0)
    return res.status(409).json({ ok: false, error: 'no_top_picks_in_gallery' })

  const { data: scoreRows } = await supabase
    .from('image_ai_scores')
    .select('image_id, hero_score, carousel_score, story_score, atmosphere_score, people_density, brand_fit, social_potential, suggested_usage, rationale_he, suggested_crop_focal_x, suggested_crop_focal_y')
    .in('image_id', picks.map(p => p.id))
  const scoreById = new Map(
    (scoreRows ?? []).map(s => [s.image_id as string, s] as const),
  )

  const photos: ScoredPhoto[] = picks.map(p => {
    const s = scoreById.get(p.id as string)
    return {
      image_id: p.id as string,
      filename: p.filename as string,
      hero_score: s ? Number(s.hero_score) : undefined,
      carousel_score: s ? Number(s.carousel_score) : undefined,
      story_score: s ? Number(s.story_score) : undefined,
      atmosphere_score: s ? Number(s.atmosphere_score) : undefined,
      people_density: s ? Number(s.people_density) : undefined,
      brand_fit: s ? Number(s.brand_fit) : undefined,
      social_potential: s ? Number(s.social_potential) : undefined,
      suggested_usage: s ? s.suggested_usage as string : undefined,
      rationale_he: s ? s.rationale_he as string : undefined,
      focal_x: s ? Number(s.suggested_crop_focal_x) : undefined,
      focal_y: s ? Number(s.suggested_crop_focal_y) : undefined,
    }
  })

  // Read the most recent feed_plan to extract scheduled posts as context.
  const { data: latestPlan } = await supabase
    .from('feed_plans')
    .select('id, posts, status')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const recentScheduled: Array<{ format: string; caption: string; source_gallery: string; days_from_now: number }> = []
  if (latestPlan?.posts && typeof latestPlan.posts === 'object' && !Array.isArray(latestPlan.posts)) {
    const planPosts = latestPlan.posts as Record<string, unknown>
    const variants = (planPosts.variants ?? []) as Array<{ id: string; posts: Array<Record<string, unknown>> }>
    const chosenId = planPosts.chosen_variant_id as string | undefined
    const variant = chosenId ? variants.find(v => v.id === chosenId) : variants[0]
    if (variant?.posts) {
      // Build a gallery_id → name map for source_gallery labelling.
      const galleryIds = Array.from(new Set(
        variant.posts.map(p => p.source_gallery_id as string | undefined).filter((x): x is string => !!x),
      ))
      const { data: galRows } = galleryIds.length
        ? await supabase.from('galleries').select('id, name').in('id', galleryIds)
        : { data: [] as Array<{ id: string; name: string }> }
      const galName = new Map((galRows ?? []).map(g => [g.id, g.name as string] as const))

      const now = Date.now()
      const byDate = variant.posts
        .map(p => {
          const scheduledAt = p.scheduled_at as string | undefined
          const t = scheduledAt ? new Date(scheduledAt).getTime() : 0
          return { p, t }
        })
        .filter(({ t }) => t >= now)
        .sort((a, b) => a.t - b.t)
        .slice(0, 6)
      for (const { p, t } of byDate) {
        const fmt = (p.format as string) ?? 'single'
        const caption = String(
          p.caption ?? p.opening_caption ?? (p.headline as string | undefined) ?? '',
        ).slice(0, 80)
        const srcGalleryId = p.source_gallery_id as string | undefined
        const sourceGallery = (srcGalleryId && galName.get(srcGalleryId)) || 'unknown'
        const days = Math.max(0, Math.round((t - now) / (1000 * 60 * 60 * 24)))
        recentScheduled.push({ format: fmt, caption, source_gallery: sourceGallery, days_from_now: days })
      }
    }
  }

  const indexToId = new Map<number, string>(photos.map((p, i) => [i + 1, p.image_id]))

  // Single Claude call.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let llmText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: [
        { type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserMessage({
            businessName: business.business_name as string,
            clientName: client.name as string,
            galleryName: gallery.name as string,
            photos,
            recentScheduled,
          }),
        },
      ],
    })
    const content = message.content[0]
    if (content?.type !== 'text')
      return res.status(502).json({ ok: false, error: 'unexpected_llm_response' })
    llmText = content.text
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(502).json({ ok: false, error: 'anthropic_call_failed', detail: msg.slice(0, 200) })
  }

  // Parse JSON.
  const jsonStart = llmText.indexOf('{')
  const jsonEnd = llmText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1)
    return res.status(502).json({ ok: false, error: 'llm_returned_no_json', tail: llmText.slice(-200) })

  let parsed: { suggestions?: RawSuggestion[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch (parseErr) {
    return res.status(502).json({
      ok: false, error: 'llm_returned_bad_json',
      detail: parseErr instanceof Error ? parseErr.message.slice(0, 120) : 'parse error',
      tail: llmText.slice(-300),
    })
  }

  const rawSuggestions = parsed.suggestions ?? []
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0)
    return res.status(502).json({ ok: false, error: 'llm_returned_no_suggestions' })

  // Resolve indices → image_ids, keep up to requestedCount suggestions.
  const resolved: ResolvedSuggestion[] = []
  for (const s of rawSuggestions.slice(0, requestedCount)) {
    if (!POST_FORMATS.includes(s.format as PostFormat)) continue
    const offset = typeof s.suggested_schedule_offset_days === 'number'
      ? Math.max(1, Math.min(30, s.suggested_schedule_offset_days))
      : 3 + resolved.length * 4

    if (s.format === 'single') {
      const idx = Number(s.image_index)
      const imageId = indexToId.get(idx)
      if (!imageId) continue
      resolved.push({
        id: newId(),
        format: 'single',
        position: null,
        source_gallery_id: gallery.id as string,
        image_id: imageId,
        caption: String(s.caption ?? ''),
        reasoning: String(s.reasoning ?? ''),
        suggested_schedule_offset_days: offset,
      })
    } else if (s.format === 'carousel') {
      const ids: string[] = []
      for (const i of s.image_indexes ?? []) {
        const id = indexToId.get(Number(i))
        if (id) ids.push(id)
      }
      if (ids.length < 2) continue
      const slideCaptions: Array<{ image_id: string; caption: string }> = []
      for (const sc of s.slide_captions ?? []) {
        const id = indexToId.get(Number(sc.image_index))
        if (id) slideCaptions.push({ image_id: id, caption: String(sc.caption ?? '') })
      }
      resolved.push({
        id: newId(),
        format: 'carousel',
        position: null,
        source_gallery_id: gallery.id as string,
        image_ids: ids,
        opening_caption: String(s.opening_caption ?? ''),
        slide_captions: slideCaptions,
        reasoning: String(s.reasoning ?? ''),
        suggested_schedule_offset_days: offset,
      })
    }
  }

  if (resolved.length === 0)
    return res.status(502).json({ ok: false, error: 'no_valid_suggestions_after_resolution' })

  return res.status(200).json({
    ok: true,
    galleryId: gallery.id,
    galleryName: gallery.name,
    suggestions: resolved,
    trace_ms: Date.now() - t0,
  })
}
