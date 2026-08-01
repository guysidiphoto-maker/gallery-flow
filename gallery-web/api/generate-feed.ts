// generate-feed.ts — the multi-format AI Visual OS planner.
//
// Input: { clientId, brief, selectedGalleryIds? }
// Output: 3 distinct variants. Each variant = a list of posts in mixed formats
// (single / carousel / story / reel_cover / text_slide). The brief drives
// curation, format mix, and rationale.
//
// Hard constraint (founder, 2026-05-06): the AI may ONLY use images where
// images.is_top_pick = true. Images without `is_top_pick` are invisible.
//
// Pipeline:
//   1. Fetch top picks for selected galleries (filtered to is_top_pick=true).
//   2. Join with image_ai_scores so the prompt sees AI scores per image
//      (hero/carousel/story potential, brand fit, suggested usage, focal point).
//   3. Single Claude Sonnet call returning a multi-format JSON plan.
//   4. Validate, resolve image_index → image_id, persist, return.
//
// Cost: ~$0.10–0.30 per generation (output is bigger than v1's text-only grid).

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { requireProductionOwnerOfClient } from '../server/entitlements.js'
import { requireSocialStudio } from '../server/features.js'

export const maxDuration = 60

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const VARIANT_IDS = ['rhythm', 'symphony', 'continuity'] as const
const POST_FORMATS = ['single', 'carousel', 'story', 'reel_cover', 'text_slide'] as const
type PostFormat = typeof POST_FORMATS[number]

// ── Brief shape ──────────────────────────────────────────────────────────
interface Brief {
  imageCount: string
  imageCountCustom?: number
  carousels: string
  spread: string
  goal: string
  contentMix: string
  feel: string
  textSlides: string
  postTypes: string[]
  totalPosts: string
  totalPostsCustom?: number
  continuity: string
}

// ── LLM raw output shape (image references via index 1..N) ───────────────
interface RawSinglePost {
  id?: string
  format: 'single'
  position: number | null
  image_index: number
  caption: string
  reasoning: string
  source_gallery_index?: number
}
interface RawCarouselPost {
  id?: string
  format: 'carousel'
  position: number | null
  image_indexes: number[]
  opening_caption: string
  slide_captions: Array<{ image_index: number; caption: string }>
  reasoning: string
  source_gallery_index?: number
}
interface RawStoryPost {
  id?: string
  format: 'story'
  position: number | null
  image_indexes: number[]
  slide_meta: Array<{ image_index: number; overlay_text?: string; sticker?: string }>
  reasoning: string
  source_gallery_index?: number
}
interface RawReelPost {
  id?: string
  format: 'reel_cover'
  position: number | null
  image_index: number
  hook_text: string
  caption: string
  reasoning: string
  source_gallery_index?: number
}
interface RawTextSlide {
  id?: string
  format: 'text_slide'
  position: number | null
  headline: string
  sub: string
  background_color: string
  text_color: string
  reasoning: string
}
type RawPost = RawSinglePost | RawCarouselPost | RawStoryPost | RawReelPost | RawTextSlide

interface RawVariant {
  id: typeof VARIANT_IDS[number]
  label: string
  tagline: string
  rationale: string
  posts: RawPost[]
}

// ── Resolved post shape (image_id, source_gallery_id) ───────────────────
interface Crop { aspect: '1:1' | '4:5' | '9:16'; focalX: number; focalY: number }
interface ResolvedSingle  { id: string; format: 'single'; position: number | null; image_id: string; caption: string; reasoning: string; source_gallery_id: string | null; crop?: Crop }
interface ResolvedCarousel{ id: string; format: 'carousel'; position: number | null; image_ids: string[]; opening_caption: string; slide_captions: Array<{ image_id: string; caption: string }>; reasoning: string; source_gallery_id: string | null; crops?: Record<string, Crop> }
interface ResolvedStory   { id: string; format: 'story'; position: number | null; image_ids: string[]; slide_meta: Array<{ image_id: string; overlay_text?: string; sticker?: string }>; reasoning: string; source_gallery_id: string | null; crops?: Record<string, Crop> }
interface ResolvedReel    { id: string; format: 'reel_cover'; position: number | null; image_id: string; hook_text: string; caption: string; reasoning: string; source_gallery_id: string | null; crop?: Crop }
interface ResolvedText    { id: string; format: 'text_slide'; position: number | null; image_id: null; headline: string; sub: string; background_color: string; text_color: string; reasoning: string; source_gallery_id: string | null }
type ResolvedPost = ResolvedSingle | ResolvedCarousel | ResolvedStory | ResolvedReel | ResolvedText

interface ResolvedVariant {
  id: string
  label: string
  tagline: string
  rationale: string
  posts: ResolvedPost[]
}

interface PhotoCtx {
  image_id: string
  filename: string
  gallery_id: string
  gallery_name: string
  score?: {
    hero_score: number
    carousel_score: number
    story_score: number
    atmosphere_score: number
    people_density: number
    brand_fit: number
    social_potential: number
    suggested_usage: string
    suggested_crop_focal_x: number
    suggested_crop_focal_y: number
    rationale_he: string
  }
}

interface FeedRequestBody {
  clientId?: string
  brief?: Brief
  selectedGalleryIds?: string[]
}

// Local UUID v4 — Vercel Node 24 has crypto.randomUUID; fall back to Math random.
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return 'p_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

// Build the SYSTEM prompt — verbose, opinionated, references the brief.
function buildSystemPrompt(brief: Brief): string {
  return `You are a senior Israeli social-media creative director planning an Instagram content plan for a production-company client. The photographer hands you a list of pre-curated top photos (with AI scores) from recent events, and a creative brief. You output 3 distinct strategy variants the photographer can choose from.

═══════════════════════════════════════════════════════════════════════════
THE BRIEF
═══════════════════════════════════════════════════════════════════════════
- Images per gallery: ${brief.imageCount}${brief.imageCountCustom ? ` (custom: ${brief.imageCountCustom})` : ''}
- Carousels:          ${brief.carousels}
- Spread:             ${brief.spread}
- Feed goal:          ${brief.goal}
- Content mix:        ${brief.contentMix}
- Grid feel:          ${brief.feel}
- Text slides:        ${brief.textSlides}
- Post types allowed: ${brief.postTypes.join(', ')}
- Total posts:        ${brief.totalPosts}${brief.totalPostsCustom ? ` (custom: ${brief.totalPostsCustom})` : ''}
- Continuity:         ${brief.continuity}

═══════════════════════════════════════════════════════════════════════════
YOUR JOB
═══════════════════════════════════════════════════════════════════════════
Propose THREE distinct variants. Each variant must respect the brief but bring its own strategy:

VARIANT A — "rhythm"     — Narrative-arc plan. Opens dramatic, builds emotional weight, closes intimate. The posts read like a magazine spread that tells a story across the grid.

VARIANT B — "symphony"   — Composition-driven. Alternates close-up vs wide, dense vs negative space. The grid feels visually balanced regardless of where you start scrolling.

VARIANT C — "continuity" — Brand-language plan. Establishes 3 recurring visual themes (people · atmosphere · detail) and repeats them — the easiest variant to continue next month.

═══════════════════════════════════════════════════════════════════════════
POST FORMATS YOU CAN USE
═══════════════════════════════════════════════════════════════════════════
Only use formats listed in "Post types allowed":

1. "single"     — one feed post. Fields: position (1..N grid slot), image_index, caption (8-14 Hebrew words, IG-style), reasoning, source_gallery_index.

2. "carousel"   — swipeable post (2-10 slides). Fields: position, image_indexes[2-10], opening_caption (the IG caption that shows on the feed), slide_captions[] (1:1 with image_indexes; can be one-line per slide), reasoning, source_gallery_index.

3. "story"      — vertical 9:16 story sequence. position should be null (stories don't sit on the feed grid). Fields: image_indexes[], slide_meta[] (one entry per image; each can have optional overlay_text), reasoning, source_gallery_index.

4. "reel_cover" — 9:16 cover for a future reel. Fields: image_index, hook_text (4-8 Hebrew words rendered LARGE on the cover), caption, reasoning, source_gallery_index.

5. "text_slide" — pure designed text card (no photo). Fields: headline (4-8 Hebrew words), sub (10-20 Hebrew words), background_color (hex), text_color (hex), reasoning. position = the grid slot it occupies.

═══════════════════════════════════════════════════════════════════════════
HARD RULES
═══════════════════════════════════════════════════════════════════════════
- ONLY use image_index values from the photos list provided. NEVER invent indices.
- Never burn text onto regular photos — captions live below feed posts. text_slide is a SEPARATE format with its own design (no photo). reel_cover is the one exception where hook_text overlays the photo (it's a cover design).
- Use the AI scores for each photo (hero/carousel/story/atmosphere/people_density/brand_fit/social_potential/suggested_usage) to pick the right photo for the right slot. A photo with usage='hero' is a strong feed-post candidate; usage='carousel_anchor' opens a carousel; usage='story_only' goes only into stories.
- Variants should mostly choose different photos — at least 40% of the photos should differ between any two variants.
- The total number of posts per variant should match brief.totalPosts (default 9).
- Caption energy: editorial Hebrew, present-tense, sensorial. Avoid generics ("רגע מיוחד", "אירוע מושלם"). No hashtags, no emojis. Examples: "האור של הערב הזה ריצף את כל הנוכחים." / "הפתיחה הראתה — זה לא יהיה ערב רגיל."
- Variant rationale (2-3 Hebrew sentences) MUST reference the brief explicitly: "בחרתי קצב עיתונאי כי המטרה שלך premium_clean ותמהיל 50_50..."
- Variant tagline: 4-6 Hebrew words, magazine-cover energy.

═══════════════════════════════════════════════════════════════════════════
OUTPUT — STRICT JSON, no preamble, no markdown
═══════════════════════════════════════════════════════════════════════════
{
  "variants": [
    {
      "id": "rhythm",
      "label": "<Hebrew name>",
      "tagline": "<4-6 Hebrew words>",
      "rationale": "<2-3 Hebrew sentences referencing the brief>",
      "posts": [
        { "format": "single", "position": 1, "image_index": 7, "caption": "...", "reasoning": "...", "source_gallery_index": 1 },
        { "format": "carousel", "position": 2, "image_indexes": [3, 12, 18], "opening_caption": "...", "slide_captions": [{"image_index": 3, "caption":"..."}, {"image_index": 12, "caption":"..."}, {"image_index": 18, "caption":"..."}], "reasoning": "...", "source_gallery_index": 4 },
        { "format": "text_slide", "position": 3, "headline": "...", "sub": "...", "background_color": "#0a0a0f", "text_color": "#ffffff", "reasoning": "..." },
        { "format": "story", "position": null, "image_indexes": [5, 9, 14, 21], "slide_meta": [{"image_index": 5}, {"image_index": 9, "overlay_text":"רגע 1"}, {"image_index": 14}, {"image_index": 21}], "reasoning": "..." },
        ... (total per variant should be ~brief.totalPosts; mix formats per the brief)
      ]
    },
    { "id": "symphony", ... },
    { "id": "continuity", ... }
  ]
}`
}

function buildUserMessage(opts: {
  businessName: string
  clientName: string
  galleries: Array<{ id: string; name: string }>
  photos: PhotoCtx[]
  brief: Brief
}): string {
  // Galleries listed with their numeric index for source_gallery_index references.
  const galleryLines = opts.galleries
    .map((g, i) => `[g${i + 1}] "${g.name}"`)
    .join('\n')

  // Photos listed with score summary so the model understands depth.
  const photoLines = opts.photos
    .map((p, i) => {
      const galleryIdx = opts.galleries.findIndex(g => g.id === p.gallery_id) + 1
      const s = p.score
      const scoreSummary = s
        ? ` · usage=${s.suggested_usage} · hero=${s.hero_score} carousel=${s.carousel_score} story=${s.story_score} atmo=${s.atmosphere_score} people=${s.people_density} brand=${s.brand_fit} social=${s.social_potential}`
        : ' · (not yet scored)'
      const rationale = s ? ` · "${s.rationale_he}"` : ''
      return `[${i + 1}] gallery=g${galleryIdx} file="${p.filename}"${scoreSummary}${rationale}`
    })
    .join('\n')

  const totalGoal = opts.brief.totalPostsCustom
    ? String(opts.brief.totalPostsCustom)
    : opts.brief.totalPosts === 'monthly_plan' ? '12' : opts.brief.totalPosts

  return `Brand: ${opts.businessName} (Israeli production-company photographer)
Client: ${opts.clientName}

GALLERIES:
${galleryLines}

PHOTOS (${opts.photos.length} top picks; reference by bracketed index 1..${opts.photos.length}):
${photoLines}

Plan ${totalGoal} posts across 3 variants (rhythm / symphony / continuity). Use ONLY these formats from the brief: ${opts.brief.postTypes.join(', ')}. Output strict JSON only.`
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Feature availability gate (contract C1) — FIRST, before origin/auth/
  // entitlement resolution. Social studio is OFF by default for everyone.
  if (!requireSocialStudio(res)) return
  const t0 = Date.now()
  const ALLOWED_ORIGINS = new Set([
    'https://pixflow-ai.com',
    'https://www.pixflow-ai.com',
  ])
  const origin = String(req.headers.origin ?? req.headers.referer ?? '')
  const isLocalDev = origin.startsWith('http://localhost')
  const isVercelPreview = /\.vercel\.app$/.test(new URL(origin || 'http://x').hostname || '')
  if (origin && !isLocalDev && !isVercelPreview) {
    try {
      const host = new URL(origin).origin
      if (!ALLOWED_ORIGINS.has(host)) {
        return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
      }
    } catch {
      return res.status(403).json({ ok: false, error: 'invalid_origin' })
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (!supabase) return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'anthropic_not_configured' })

  const body = (req.body || {}) as FeedRequestBody
  const clientId = String(body.clientId ?? '').trim()
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' })
  const brief = body.brief
  if (!brief || typeof brief !== 'object')
    return res.status(400).json({ ok: false, error: 'brief_required' })

  // Blocker 2 gate: authenticated owner of this client only, before any AI call.
  const gate = await requireProductionOwnerOfClient(req, supabase, clientId)
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.code })

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, business_name, slug')
    .eq('id', client.business_id)
    .maybeSingle()
  if (!business) return res.status(404).json({ ok: false, error: 'business_not_found' })

  let { data: galleries } = await supabase
    .from('galleries')
    .select('id, name, delivery_settings')
    .eq('client_id', clientId)
    .eq('status', 'live')
  if (!galleries || galleries.length === 0)
    return res.status(404).json({ ok: false, error: 'no_galleries' })

  // Optional gallery filter from request.
  const selectedIds = Array.isArray(body.selectedGalleryIds) && body.selectedGalleryIds.length > 0
    ? new Set(body.selectedGalleryIds)
    : null
  if (selectedIds) galleries = galleries.filter(g => selectedIds.has(g.id))
  if (galleries.length === 0)
    return res.status(404).json({ ok: false, error: 'no_galleries_after_filter' })

  const galleryIds = galleries.map(g => g.id)

  // Top picks across selected galleries — capped at 30 to keep prompt tight.
  const { data: picks } = await supabase
    .from('images')
    .select('id, gallery_id, filename')
    .in('gallery_id', galleryIds)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(30)
  if (!picks || picks.length < 9)
    return res.status(409).json({ ok: false, error: 'need_at_least_9_top_picks', have: picks?.length ?? 0 })

  // Join with image_ai_scores (may be partial — we degrade gracefully).
  const { data: scores } = await supabase
    .from('image_ai_scores')
    .select('image_id, hero_score, carousel_score, story_score, atmosphere_score, people_density, brand_fit, social_potential, suggested_usage, suggested_crop_focal_x, suggested_crop_focal_y, rationale_he')
    .in('image_id', picks.map(p => p.id))
  const scoresById = new Map<string, NonNullable<typeof scores>[number]>()
  for (const s of scores ?? []) scoresById.set(s.image_id as string, s)

  const photos: PhotoCtx[] = picks.map(p => {
    const gallery = galleries.find(g => g.id === p.gallery_id)
    const sRow = scoresById.get(p.id as string)
    return {
      image_id: p.id as string,
      filename: p.filename as string,
      gallery_id: p.gallery_id as string,
      gallery_name: (gallery?.name as string) || 'event',
      score: sRow ? {
        hero_score: Number(sRow.hero_score),
        carousel_score: Number(sRow.carousel_score),
        story_score: Number(sRow.story_score),
        atmosphere_score: Number(sRow.atmosphere_score),
        people_density: Number(sRow.people_density),
        brand_fit: Number(sRow.brand_fit),
        social_potential: Number(sRow.social_potential),
        suggested_usage: sRow.suggested_usage as string,
        suggested_crop_focal_x: Number(sRow.suggested_crop_focal_x),
        suggested_crop_focal_y: Number(sRow.suggested_crop_focal_y),
        rationale_he: sRow.rationale_he as string,
      } : undefined,
    }
  })

  const indexToId = new Map<number, string>(photos.map((p, i) => [i + 1, p.image_id]))
  const indexToFocal = new Map<number, { x: number; y: number }>()
  photos.forEach((p, i) => {
    if (p.score) indexToFocal.set(i + 1, { x: p.score.suggested_crop_focal_x, y: p.score.suggested_crop_focal_y })
  })
  const galleryIndexToId = new Map<number, string>(galleries.map((g, i) => [i + 1, g.id]))

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let llmText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      // The brief-driven system prompt is large (~5k tokens). Cache it so
      // a retry within 5 min reuses the cached prefix at 10% cost.
      system: [
        { type: 'text', text: buildSystemPrompt(brief), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserMessage({
            businessName: business.business_name as string,
            clientName: client.name as string,
            galleries: galleries.map(g => ({ id: g.id as string, name: g.name as string })),
            photos,
            brief,
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

  const jsonStart = llmText.indexOf('{')
  const jsonEnd = llmText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1)
    return res.status(502).json({
      ok: false, error: 'llm_returned_no_json',
      ...(process.env.NODE_ENV !== 'production' ? { tail: llmText.slice(-300), length: llmText.length } : {}),
    })

  let parsed: { variants?: RawVariant[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch (parseErr) {
    return res.status(502).json({
      ok: false, error: 'llm_returned_bad_json',
      detail: parseErr instanceof Error ? parseErr.message.slice(0, 120) : 'parse error',
      ...(process.env.NODE_ENV !== 'production' ? { tail: llmText.slice(-400), length: llmText.length } : {}),
    })
  }

  const variantsRaw = parsed.variants ?? []
  if (!Array.isArray(variantsRaw) || variantsRaw.length !== 3)
    return res.status(502).json({ ok: false, error: 'llm_returned_wrong_variant_count', count: variantsRaw.length })

  const resolvedVariants: ResolvedVariant[] = []
  for (const v of variantsRaw) {
    if (!VARIANT_IDS.includes(v.id))
      return res.status(502).json({ ok: false, error: 'llm_invalid_variant_id', got: v.id })
    if (!Array.isArray(v.posts) || v.posts.length < 1)
      return res.status(502).json({ ok: false, error: 'llm_variant_no_posts' })

    const resolvedPosts: ResolvedPost[] = []
    for (const p of v.posts) {
      if (!POST_FORMATS.includes(p.format as PostFormat))
        return res.status(502).json({ ok: false, error: 'llm_invalid_format', got: p.format })

      const sourceGalleryId = (p.format !== 'text_slide' && p.source_gallery_index)
        ? galleryIndexToId.get(p.source_gallery_index) ?? null
        : null

      try {
        if (p.format === 'single') {
          const idx = Number(p.image_index)
          const imageId = indexToId.get(idx)
          if (!imageId) throw new Error(`bad image_index ${p.image_index}`)
          const focal = indexToFocal.get(idx)
          resolvedPosts.push({
            id: newId(), format: 'single', position: p.position ?? null,
            image_id: imageId,
            caption: String(p.caption ?? ''),
            reasoning: String(p.reasoning ?? ''),
            source_gallery_id: sourceGalleryId,
            crop: focal ? { aspect: '1:1', focalX: focal.x, focalY: focal.y } : undefined,
          })
        } else if (p.format === 'carousel') {
          const ids = (p.image_indexes ?? []).map(i => {
            const id = indexToId.get(Number(i))
            if (!id) throw new Error(`bad carousel image_index ${i}`)
            return id
          })
          if (ids.length < 2 || ids.length > 10) throw new Error(`carousel slide count ${ids.length}`)
          const slideCaptions = (p.slide_captions ?? []).map(sc => {
            const id = indexToId.get(Number(sc.image_index))
            if (!id) throw new Error(`bad slide image_index ${sc.image_index}`)
            return { image_id: id, caption: String(sc.caption ?? '') }
          })
          resolvedPosts.push({
            id: newId(), format: 'carousel', position: p.position ?? null,
            image_ids: ids,
            opening_caption: String(p.opening_caption ?? ''),
            slide_captions: slideCaptions,
            reasoning: String(p.reasoning ?? ''),
            source_gallery_id: sourceGalleryId,
          })
        } else if (p.format === 'story') {
          const ids = (p.image_indexes ?? []).map(i => {
            const id = indexToId.get(Number(i))
            if (!id) throw new Error(`bad story image_index ${i}`)
            return id
          })
          const slideMeta = (p.slide_meta ?? []).map(sm => ({
            image_id: indexToId.get(Number(sm.image_index)) ?? '',
            overlay_text: sm.overlay_text,
            sticker: sm.sticker,
          }))
          resolvedPosts.push({
            id: newId(), format: 'story', position: p.position ?? null,
            image_ids: ids,
            slide_meta: slideMeta,
            reasoning: String(p.reasoning ?? ''),
            source_gallery_id: sourceGalleryId,
          })
        } else if (p.format === 'reel_cover') {
          const idx = Number(p.image_index)
          const imageId = indexToId.get(idx)
          if (!imageId) throw new Error(`bad image_index ${p.image_index}`)
          const focal = indexToFocal.get(idx)
          resolvedPosts.push({
            id: newId(), format: 'reel_cover', position: p.position ?? null,
            image_id: imageId,
            hook_text: String(p.hook_text ?? ''),
            caption: String(p.caption ?? ''),
            reasoning: String(p.reasoning ?? ''),
            source_gallery_id: sourceGalleryId,
            crop: focal ? { aspect: '9:16', focalX: focal.x, focalY: focal.y } : undefined,
          })
        } else if (p.format === 'text_slide') {
          resolvedPosts.push({
            id: newId(), format: 'text_slide', position: p.position ?? null,
            image_id: null,
            headline: String(p.headline ?? ''),
            sub: String(p.sub ?? ''),
            background_color: String(p.background_color ?? '#0a0a0f'),
            text_color: String(p.text_color ?? '#ffffff'),
            reasoning: String(p.reasoning ?? ''),
            source_gallery_id: null,
          })
        }
      } catch (validateErr) {
        return res.status(502).json({
          ok: false,
          error: 'llm_post_validation_failed',
          detail: validateErr instanceof Error ? validateErr.message : 'validation error',
        })
      }
    }

    resolvedVariants.push({
      id: v.id, label: v.label, tagline: v.tagline, rationale: v.rationale,
      posts: resolvedPosts,
    })
  }

  // Persist plan with brief in JSONB.
  const { data: plan, error: insertErr } = await supabase
    .from('feed_plans')
    .insert({
      business_id: business.id,
      client_id: client.id,
      source_gallery_ids: galleryIds,
      style: 'color_block_editorial',
      posts: { brief, variants: resolvedVariants },
      brand_snapshot: {
        business_name: business.business_name,
        client_name: client.name,
        photo_count: photos.length,
        scored_count: scoresById.size,
      },
      llm_trace: {
        model: 'claude-sonnet-4-6',
        latency_ms: Date.now() - t0,
        prompt_chars: buildSystemPrompt(brief).length,
        variant_ids: resolvedVariants.map(v => v.id),
      },
      status: 'draft',
    })
    .select('id, posts, status, created_at')
    .single()

  if (insertErr || !plan)
    return res.status(500).json({ ok: false, error: 'persist_failed', detail: insertErr?.message?.slice(0, 200) })

  return res.status(200).json({
    ok: true,
    plan: {
      id: plan.id,
      brief,
      variants: resolvedVariants,
      status: plan.status,
      created_at: plan.created_at,
    },
    trace_ms: Date.now() - t0,
  })
}

export default withSentry('generate-feed', handler)
