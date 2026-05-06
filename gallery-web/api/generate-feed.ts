// generate-feed.ts — the AI Visual OS planning surface.
//
// Replaces a paid social-media manager. The photographer drops an event;
// the AI returns THREE distinct feed plans (curations + arrangements + captions),
// each with a different strategic concept. The photographer picks one.
//
// Photos are NEVER overlaid with text in this product — captions live below
// the post, like real Instagram. The AI's job is curation, arrangement,
// and voice — not graphic design on top of the photos.
//
// Single Claude Sonnet call. ~3000 output tokens for 3 variants × 9 posts each.
// Cost: ~$0.10–0.20 per generation.

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

interface PostPlan {
  position: number    // 1..9
  image_id: string    // one of the provided uuids
  caption: string     // first-line IG caption, 8-14 Hebrew words
  reasoning: string   // one Hebrew sentence — why this photo, this position, in this variant
}

interface Variant {
  id: string          // 'rhythm' | 'symphony' | 'continuity'
  label: string       // Hebrew name shown to user
  tagline: string     // 4-6 word Hebrew tagline, magazine-cover energy
  rationale: string   // 2-3 Hebrew sentences explaining the strategy
  posts: PostPlan[]   // 9 posts, positions 1..9
}

const VARIANT_IDS = ['rhythm', 'symphony', 'continuity'] as const

const SYSTEM_PROMPT = `You are a senior Instagram social-media manager + creative director planning a 9-post Instagram feed (3×3 grid) for an Israeli production-company brand.

The photographer hands you up to 30 hand-picked photos from recent events. Your job: propose THREE distinct feed plans so the photographer can pick the one that fits the moment. The photos themselves are CLEAN — no text overlays, no graphic treatments. Captions live beneath each post like a real Instagram feed.

The three variants MUST be strategically different (different curations, different arrangements, different rationales):

VARIANT A — "rhythm" — קצב עיתונאי
Narrative-arc plan. Opens dramatic, builds emotional weight, closes intimate. Like a magazine spread that walks the reader through a story. The first row should hook attention, the middle row should deepen the brand, the bottom row should leave warmth.

VARIANT B — "symphony" — סימפוניית קומפוזיציה
Composition-driven. Alternates close-up vs wide, dense vs negative space, in a checkerboard rhythm across the 9 tiles. The grid feels visually balanced regardless of which photo you click first. Less story, more visual harmony.

VARIANT C — "continuity" — המשכיות מותג
Brand-continuity plan. Establishes 3 recurring visual themes (people · atmosphere · detail) and repeats them across the grid in a pattern, so the brand language carries across future events. Most "templated" — easiest to continue next month.

For EACH variant:
- Pick 9 photos out of the 30 provided. Variants SHOULD mostly pick different photos — at least 4 of the 9 should differ between any two variants.
- Assign each chosen photo to a position 1..9 (1 = top-left of the 3×3 grid, 9 = bottom-right; row-major).
- Write a 1-line Hebrew caption per post — what shows below the photo on Instagram. 8–14 Hebrew words. Editorial, present-tense, sensorial. Like top Israeli production-company accounts. NO hashtags. NO emojis. NO generic phrases ("רגע מיוחד", "אירוע מושלם").
- Write a one-sentence Hebrew reasoning per post — why this photo, in this position, in this variant.
- Write a 2–3 sentence Hebrew rationale for the variant as a whole — why this strategy fits this brand.
- Write a 4–6 word Hebrew tagline for the variant — magazine-cover energy.

Output STRICT JSON only — no preamble, no markdown:
{
  "variants": [
    {
      "id": "rhythm",
      "label": "קצב עיתונאי",
      "tagline": "...",
      "rationale": "...",
      "posts": [
        { "position": 1, "image_id": "<uuid from provided list>", "caption": "...", "reasoning": "..." },
        ... (9 total, positions 1-9, image_ids must each be unique within the variant)
      ]
    },
    { "id": "symphony", ... },
    { "id": "continuity", ... }
  ]
}

Hebrew style examples (caption energy):
- "האור של הערב הזה ריצף את כל הנוכחים."
- "פתחנו את הבמה והבנו — זה לא יהיה ערב רגיל."
- "הפרטים הקטנים שמחזיקים את הסיפור הגדול."

Reasoning style examples:
- "פותחת את הגריד בקלוז-אפ אינטימי כדי לרכך את הצופה לפני הסצנות הרחבות בשורה 2."
- "ממקמת את תמונת הקהל במרכז כי שתי השורות מסביבה כבר בנויות מקלוז-אפים — היא נותנת אוויר."`

function buildUserMessage(opts: {
  businessName: string
  clientName: string
  eventType: string
  photos: Array<{ image_id: string; filename: string; gallery_name: string }>
}): string {
  const photoLines = opts.photos
    .map(
      (p, i) =>
        `${String(i + 1).padStart(2, '0')}. id=${p.image_id} · gallery="${p.gallery_name}" · file="${p.filename}"`,
    )
    .join('\n')
  return `Brand: ${opts.businessName} (Israeli production-company photographer)
Client: ${opts.clientName}
Event type: ${opts.eventType}

The ${opts.photos.length} hand-picked top photos to work with:
${photoLines}

Plan 3 distinct feed variants (rhythm / symphony / continuity). Output strict JSON only.`
}

interface FeedRequestBody {
  clientId?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  if (!supabase) return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'anthropic_not_configured' })

  const body = (req.body || {}) as FeedRequestBody
  const clientId = String(body.clientId ?? '').trim()
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' })

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

  const { data: galleries } = await supabase
    .from('galleries')
    .select('id, name, delivery_settings')
    .eq('client_id', clientId)
    .eq('status', 'live')
  const galleryIds = (galleries ?? []).map(g => g.id)
  if (galleryIds.length === 0)
    return res.status(404).json({ ok: false, error: 'no_galleries' })

  // Pull up to 30 top picks across all galleries — the AI curates 9 of these
  // per variant, and different variants should pick different subsets.
  const { data: picks } = await supabase
    .from('images')
    .select('id, gallery_id, filename')
    .in('gallery_id', galleryIds)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(30)
  const photos = (picks ?? []).map(p => {
    const gallery = (galleries ?? []).find(g => g.id === p.gallery_id)
    return {
      image_id: p.id as string,
      filename: p.filename as string,
      gallery_name: (gallery?.name as string) || 'event',
    }
  })
  if (photos.length < 9)
    return res.status(409).json({ ok: false, error: 'need_at_least_9_top_picks', have: photos.length })

  const firstSettings = (galleries?.[0]?.delivery_settings || {}) as Record<string, unknown>
  const eventType = (firstSettings.eventType as string) || 'event'

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let llmText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserMessage({
            businessName: business.business_name as string,
            clientName: client.name as string,
            eventType,
            photos,
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

  // Strict-JSON parsing.
  const jsonStart = llmText.indexOf('{')
  const jsonEnd = llmText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1)
    return res.status(502).json({ ok: false, error: 'llm_returned_no_json' })
  let parsed: { variants?: Variant[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch {
    return res.status(502).json({ ok: false, error: 'llm_returned_bad_json' })
  }

  const variants = parsed.variants ?? []
  if (!Array.isArray(variants) || variants.length !== 3)
    return res.status(502).json({ ok: false, error: 'llm_returned_wrong_variant_count', count: variants.length })

  // Validate every variant + every post.
  const validImageIds = new Set(photos.map(p => p.image_id))
  for (const v of variants) {
    if (!VARIANT_IDS.includes(v.id as typeof VARIANT_IDS[number]))
      return res.status(502).json({ ok: false, error: 'llm_invalid_variant_id', got: v.id })
    if (!Array.isArray(v.posts) || v.posts.length !== 9)
      return res.status(502).json({ ok: false, error: 'llm_variant_wrong_post_count', got: v.posts?.length })
    const seenPositions = new Set<number>()
    const seenImages = new Set<string>()
    for (const p of v.posts) {
      if (!validImageIds.has(p.image_id))
        return res.status(502).json({ ok: false, error: 'llm_invalid_image_id', got: p.image_id })
      if (typeof p.position !== 'number' || p.position < 1 || p.position > 9)
        return res.status(502).json({ ok: false, error: 'llm_invalid_position', got: p.position })
      if (seenPositions.has(p.position))
        return res.status(502).json({ ok: false, error: 'llm_duplicate_position', got: p.position })
      if (seenImages.has(p.image_id))
        return res.status(502).json({ ok: false, error: 'llm_duplicate_image_in_variant', got: p.image_id })
      seenPositions.add(p.position)
      seenImages.add(p.image_id)
    }
  }

  // Persist all 3 variants in posts JSONB. Status=draft until photographer picks one.
  const { data: plan, error: insertErr } = await supabase
    .from('feed_plans')
    .insert({
      business_id: business.id,
      client_id: client.id,
      source_gallery_ids: galleryIds,
      style: 'color_block_editorial',
      posts: { variants },
      brand_snapshot: {
        business_name: business.business_name,
        client_name: client.name,
        event_type: eventType,
        photo_count: photos.length,
      },
      llm_trace: {
        model: 'claude-sonnet-4-6',
        latency_ms: Date.now() - t0,
        prompt_chars: SYSTEM_PROMPT.length,
        variant_ids: variants.map(v => v.id),
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
      variants,
      status: plan.status,
      created_at: plan.created_at,
    },
    traceMs: Date.now() - t0,
  })
}
