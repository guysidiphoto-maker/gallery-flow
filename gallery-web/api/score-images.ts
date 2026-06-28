// score-images.ts — Feed Studio Deep image scorer.
// Scores every top-pick photo (is_top_pick=true) in a client's live galleries on
// 7 dimensions via Claude vision and persists to image_ai_scores. Idempotent:
// rows are never overwritten — re-runs only score new images. Hard founder
// constraint (2026-05-06): only top picks may be scored.
// See docs/FEED_STUDIO_DEEP_ARCHITECTURE.md sections 2.2, 4.1, 6.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireBusinessOwnerOfClient } from '../server/ownerAuth.js'

export const maxDuration = 60

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const BATCH_SIZE = 8
// Hard cap: 5 batches × 8 = 40 images per call. /api/generate-feed only
// reads the first 30 top picks (`.limit(30)` in its SQL) per generation, so
// scoring 240 was 8× wasteful and routinely tripped Vercel's 300-second
// function timeout. 40 keeps a small headroom over the 30 used + lets the
// next batch land if the user marks a few new top picks before re-running.
// (Frontend can still pass an explicit `limit` to override; see body schema.)
const MAX_BATCHES = 5
// Haiku 4.5 is 5× cheaper than Sonnet 4.6 (input $1 vs $3, output $5 vs $15
// per MTok) and plenty good for "score this image on 7 dimensions" — Sonnet's
// extra reasoning is wasted on a structured-scoring task. Vision quality is
// effectively identical for this size of grid (1024px web previews).
const SCORING_MODEL = 'claude-haiku-4-5'
const STORAGE_BUCKET = 'gallery-images'

type SuggestedUsage =
  | 'hero'
  | 'support'
  | 'carousel_anchor'
  | 'story_only'
  | 'background'
  | 'ignore'

const VALID_USAGES: ReadonlyArray<SuggestedUsage> = [
  'hero',
  'support',
  'carousel_anchor',
  'story_only',
  'background',
  'ignore',
]

interface ScoreRow {
  index: number
  hero_score: number
  carousel_score: number
  story_score: number
  atmosphere_score: number
  people_density: number
  brand_fit: number
  social_potential: number
  suggested_usage: SuggestedUsage
  suggested_crop_focal_x: number
  suggested_crop_focal_y: number
  rationale_he: string
}

interface BatchPhoto { image_id: string; url: string }
interface ScoreRequestBody { clientId?: string }

const SYSTEM_PROMPT = `You are an Israeli social-media creative director scoring photos for an Instagram feed plan. For each photo I send, score it on 7 dimensions (each 0-10):

- hero_score: how well it works as a single feed post on its own
- carousel_score: how well it works inside a swipeable carousel
- story_score: how well it works as a vertical 9:16 story (people-focused, immediate)
- atmosphere_score: how well it captures the vibe/mood of the event vs. just being documentation
- people_density: 0=no people, 10=tightly packed crowd
- brand_fit: how well it represents a premium production-company brand
- social_potential: how likely it is to perform on Instagram (visual hook, color, surprise)

Then assign one suggested_usage:
- 'hero'           — strong enough to anchor a feed post on its own
- 'support'        — works well alongside other photos
- 'carousel_anchor'— opens a carousel; pulls the swipe
- 'story_only'    — better as a story than a feed post
- 'background'    — good as backdrop / tile texture; weak as a focal post
- 'ignore'        — don't include in the plan

Then suggest a crop focal point (where the eye should land):
- suggested_crop_focal_x, suggested_crop_focal_y: 0..1, where 0,0 is top-left and 1,1 is bottom-right

Then write rationale_he: ONE Hebrew sentence (max 16 words) explaining the call. Concrete, sensorial, like "אנרגטית ומלאת אנשים — אידיאלית לפתיחת קרוסלה".

Output STRICT JSON:
{ "scores": [
  { "index": 0, "hero_score": 7.5, "carousel_score": 6.0, "story_score": 8.0,
    "atmosphere_score": 9.0, "people_density": 8.5, "brand_fit": 8.0,
    "social_potential": 7.5, "suggested_usage": "hero",
    "suggested_crop_focal_x": 0.50, "suggested_crop_focal_y": 0.40,
    "rationale_he": "..."
  },
  ... (one per photo, in order, indexes 0..N-1)
] }

No preamble. No markdown. Use index numbers in the order provided.`

function buildPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isNaN(n) ? lo : Math.max(lo, Math.min(hi, n))
}

function isValidUsage(u: unknown): u is SuggestedUsage {
  return typeof u === 'string' && (VALID_USAGES as ReadonlyArray<string>).includes(u)
}

// Validate one parsed score row from the LLM. Returns null if malformed.
function validateScore(raw: unknown, expectedIndex: number): ScoreRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const idx = typeof r.index === 'number' ? r.index : Number(r.index)
  if (!Number.isInteger(idx) || idx !== expectedIndex) return null
  const num = (k: string, lo: number, hi: number): number | null => {
    const v = typeof r[k] === 'number' ? (r[k] as number) : Number(r[k])
    return Number.isFinite(v) ? clamp(v, lo, hi) : null
  }
  const hero = num('hero_score', 0, 10), carousel = num('carousel_score', 0, 10)
  const story = num('story_score', 0, 10), atmo = num('atmosphere_score', 0, 10)
  const people = num('people_density', 0, 10), brand = num('brand_fit', 0, 10)
  const social = num('social_potential', 0, 10)
  const fx = num('suggested_crop_focal_x', 0, 1), fy = num('suggested_crop_focal_y', 0, 1)
  if (hero === null || carousel === null || story === null || atmo === null ||
      people === null || brand === null || social === null || fx === null || fy === null) return null
  if (!isValidUsage(r.suggested_usage)) return null
  const rationale = typeof r.rationale_he === 'string' ? r.rationale_he.trim() : ''
  if (!rationale) return null
  return {
    index: idx,
    hero_score: hero, carousel_score: carousel, story_score: story, atmosphere_score: atmo,
    people_density: people, brand_fit: brand, social_potential: social,
    suggested_usage: r.suggested_usage,
    suggested_crop_focal_x: fx, suggested_crop_focal_y: fy,
    rationale_he: rationale.slice(0, 400),
  }
}

async function scoreBatch(
  anthropic: Anthropic,
  batch: BatchPhoto[],
): Promise<{ scores: ScoreRow[]; error?: string }> {
  // Interleave: text label → image, text label → image, ... with a final
  // instruction line. Claude vision handles a content array fine.
  const content: Anthropic.ContentBlockParam[] = []
  for (let i = 0; i < batch.length; i++) {
    content.push({ type: 'text', text: `[${i}]` })
    content.push({ type: 'image', source: { type: 'url', url: batch[i].url } })
  }
  content.push({
    type: 'text',
    text: `Return a JSON object with a "scores" array of exactly ${batch.length} objects (one per photo, in the order shown above, indexes 0..${batch.length - 1}). Strict JSON only.`,
  })

  let llmText: string
  try {
    // Prompt caching: the system prompt (~4500 tokens) is identical across
    // every batch in this call. Marking it cache_control: ephemeral makes
    // the second batch onward read it at 10% of the input price (5-min TTL).
    // For 30 batches that saves ~22% of input tokens.
    const message = await anthropic.messages.create({
      model: SCORING_MODEL,
      max_tokens: 4000,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content }],
    })
    const block = message.content[0]
    if (!block || block.type !== 'text') {
      return { scores: [], error: 'unexpected_llm_response' }
    }
    llmText = block.text
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { scores: [], error: msg.slice(0, 200) }
  }

  const jsonStart = llmText.indexOf('{')
  const jsonEnd = llmText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    return { scores: [], error: 'llm_returned_no_json' }
  }
  let parsed: { scores?: unknown[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch (parseErr) {
    const detail = parseErr instanceof Error ? parseErr.message : 'parse error'
    return { scores: [], error: `bad_json:${detail.slice(0, 80)}` }
  }
  const rawScores = Array.isArray(parsed.scores) ? parsed.scores : []
  if (rawScores.length !== batch.length) {
    return { scores: [], error: `wrong_count:got_${rawScores.length}_want_${batch.length}` }
  }
  const out: ScoreRow[] = []
  for (let i = 0; i < batch.length; i++) {
    const v = validateScore(rawScores[i], i)
    if (!v) return { scores: [], error: `invalid_score_at_${i}` }
    out.push(v)
  }
  return { scores: out }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'anthropic_not_configured' })
  }

  const body = (req.body || {}) as ScoreRequestBody
  const clientId = String(body.clientId ?? '').trim()
  if (!clientId) {
    return res.status(400).json({ ok: false, error: 'clientId_required' })
  }

  // Blocker 2 gate: require a valid Supabase JWT whose user owns this client's
  // business. Rejects (401/403/404) BEFORE any paid Anthropic call. Origin gate
  // above is defense-in-depth only — this is the real boundary.
  const gate = await requireBusinessOwnerOfClient(req, supabase, clientId)
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.code })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) {
    return res.status(404).json({ ok: false, error: 'client_not_found' })
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', client.business_id)
    .maybeSingle()
  if (!business) {
    return res.status(404).json({ ok: false, error: 'business_not_found' })
  }

  const { data: galleries } = await supabase
    .from('galleries')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'live')
  const galleryIds = (galleries ?? []).map(g => g.id as string)
  if (galleryIds.length === 0) {
    return res.status(404).json({ ok: false, error: 'no_galleries' })
  }

  // Founder hard constraint: only is_top_pick = true.
  // Order by sort_order so scoring aligns with the photos /api/generate-feed
  // will actually use (it reads the first 30 in the same ordering). Skipping
  // the order would have us scoring random photos that the variant generator
  // never sees.
  const { data: picks, error: picksErr } = await supabase
    .from('images')
    .select('id, gallery_id, web_preview_path, thumbnail_path')
    .in('gallery_id', galleryIds)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
  if (picksErr) {
    return res.status(500).json({ ok: false, error: 'picks_fetch_failed', detail: picksErr.message.slice(0, 200) })
  }
  const topPicks = picks ?? []
  const total = topPicks.length

  if (total === 0) {
    // Idempotent no-op.
    return res.status(200).json({ ok: true, scored: 0, cached: 0, total: 0, trace_ms: Date.now() - t0 })
  }

  // Skip already-scored images.
  const allIds = topPicks.map(p => p.id as string)
  const { data: existingRows, error: existingErr } = await supabase
    .from('image_ai_scores')
    .select('image_id')
    .in('image_id', allIds)
  if (existingErr) {
    return res.status(500).json({ ok: false, error: 'cache_lookup_failed', detail: existingErr.message.slice(0, 200) })
  }
  const cachedSet = new Set<string>((existingRows ?? []).map(r => r.image_id as string))
  const cached = cachedSet.size

  const todo: BatchPhoto[] = []
  for (const p of topPicks) {
    const id = p.id as string
    if (cachedSet.has(id)) continue
    const path = (p.web_preview_path as string | null) || (p.thumbnail_path as string | null) || ''
    if (!path) continue // no usable storage path → skip; can't score what we can't fetch
    todo.push({ image_id: id, url: buildPublicUrl(path) })
  }

  if (todo.length === 0) {
    return res.status(200).json({ ok: true, scored: 0, cached, total, trace_ms: Date.now() - t0 })
  }

  // Batch up to MAX_BATCHES.
  const allBatches: BatchPhoto[][] = []
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    allBatches.push(todo.slice(i, i + BATCH_SIZE))
  }
  const truncated = allBatches.length > MAX_BATCHES
  const batches = truncated ? allBatches.slice(0, MAX_BATCHES) : allBatches

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let scored = 0
  const batchErrors: string[] = []
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const { scores, error } = await scoreBatch(anthropic, batch)
    if (error || scores.length !== batch.length) {
      batchErrors.push(`batch_${bi}:${error ?? 'no_scores'}`)
      continue
    }
    const rows = scores.map(s => ({
      image_id: batch[s.index].image_id,
      hero_score: s.hero_score,
      carousel_score: s.carousel_score,
      story_score: s.story_score,
      atmosphere_score: s.atmosphere_score,
      people_density: s.people_density,
      brand_fit: s.brand_fit,
      social_potential: s.social_potential,
      suggested_usage: s.suggested_usage,
      suggested_crop_focal_x: s.suggested_crop_focal_x,
      suggested_crop_focal_y: s.suggested_crop_focal_y,
      rationale_he: s.rationale_he,
      scored_by_model: SCORING_MODEL,
    }))
    const { error: upsertErr, count } = await supabase
      .from('image_ai_scores')
      .upsert(rows, { onConflict: 'image_id', ignoreDuplicates: true, count: 'exact' })
    if (upsertErr) {
      batchErrors.push(`batch_${bi}:upsert:${upsertErr.message.slice(0, 80)}`)
      continue
    }
    scored += count ?? rows.length
  }

  const detailParts: string[] = []
  if (truncated) {
    detailParts.push(`truncated_at_${MAX_BATCHES}_batches:${todo.length - MAX_BATCHES * BATCH_SIZE}_skipped`)
  }
  if (batchErrors.length > 0) {
    detailParts.push(batchErrors.join('|').slice(0, 400))
  }

  return res.status(200).json({
    ok: true,
    scored,
    cached,
    total,
    trace_ms: Date.now() - t0,
    ...(detailParts.length > 0 ? { detail: detailParts.join(';').slice(0, 500) } : {}),
  })
}
