// generate-feed.ts — first endpoint of the AI Visual Operating System.
//
// Input: { clientId, style? }
// Output: { ok: true, plan: { id, posts: [...] }, traceMs }
//         or  { ok: false, error }
//
// Pipeline:
//   1. Fetch the client's top picks (up to 12, we pick best 9).
//   2. Fetch business name + slug for the brand prompt.
//   3. Single Claude Sonnet call producing 9 posts:
//        - caption: 3-5 word Hebrew headline
//        - theme: Hebrew tag ("אווירה", "פנים", "מאחורי הקלעים", etc.)
//        - color: enum ('red'|'cream'|'teal'|'blue'|'indigo')
//        - reasoning: one sentence in Hebrew explaining the choice
//        - position: 1..9 (top-left → bottom-right grid position)
//   4. Persist as a draft feed_plan row + return.
//
// We hold to one Claude call total — the architecture committed to predictable
// per-event cost (~$0.10–0.20 per generation). Image gen / SAM 3 are NOT in
// the MVP demo path; the visual color-block effect is achieved purely via
// CSS (mix-blend-mode: multiply) on the client. That's intentional — the AI
// thinks; the CSS shows.

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

// Five colors per the architecture's Color-Block Editorial palette. The AI
// picks one per post; we render it on the client. Deliberate: AI decides
// rhythm, code decides hex.
const COLOR_KEYS = ['red', 'cream', 'teal', 'blue', 'indigo'] as const
type ColorKey = typeof COLOR_KEYS[number]

interface PostPlan {
  position: number       // 1..9
  image_id: string
  caption: string        // 3-5 word Hebrew headline
  theme: string          // Hebrew tag
  color: ColorKey
  reasoning: string      // one Hebrew sentence
}

const SYSTEM_PROMPT = `You are an art director and social media strategist building a 9-post Instagram feed (3×3 grid) for an Israeli production company's brand.

Style: Color-Block Editorial. Each post is a magazine-poster: subject on a solid color background from a fixed brand palette, bold short headline.

Your job, for the 9 photos provided:
- Assign each photo to a grid position (1=top-left, 2=top-center, 3=top-right, 4=middle-left, ..., 9=bottom-right). Plan the rhythm: vary subject density, alternate close-up vs wide, spread color across the grid so no two same colors touch (a checkerboard sense).
- Write a 3-5 word HEADLINE in Hebrew per photo. NOT a description. A magazine cover line. Strong, present-tense, no hashtags.
- Pick a theme tag in Hebrew per post (e.g. "אווירה", "פנים", "מאחורי הקלעים", "פתיחה", "סגירה", "פרט", "המון", "חלל", "המנחה").
- Pick one color per post from: red, cream, teal, blue, indigo. Distribute across the 9 tiles so no two adjacent tiles share a color.
- Write one Hebrew sentence (max 14 words) explaining WHY this photo is in this position with this color and headline.

Output STRICT JSON with shape:
{
  "posts": [
    { "position": 1, "image_id": "<uuid>", "caption": "...", "theme": "...", "color": "red|cream|teal|blue|indigo", "reasoning": "..." },
    ... (9 entries total)
  ]
}

Hebrew rules:
- Headlines feel like 2024-2026 Israeli editorial fashion + production-company copy. Confident, minimal.
- Avoid Canva-default phrases. Avoid emojis. Avoid all-caps.
- Use 3-5 Hebrew words. Examples: "הרגע הראשון", "הקהל", "מאחורי הקלעים", "הפתיחה", "אור צד".

Reasoning rules:
- One sentence in Hebrew. Concrete. References the photo, the position, or the rhythm. Example: "סגרתי את שורה 1 בתמונת קהל כי שורה 2 פותחת בקלוז-אפ — איזון."`

function buildUserMessage(opts: {
  businessName: string
  clientName: string
  eventType: string
  photos: Array<{ image_id: string; filename: string; gallery_name: string }>
}): string {
  const photoLines = opts.photos
    .slice(0, 9)
    .map(
      (p, i) =>
        `${i + 1}. id=${p.image_id} · gallery="${p.gallery_name}" · file="${p.filename}"`,
    )
    .join('\n')
  return `Brand: ${opts.businessName} (production-company photographer)
Client: ${opts.clientName}
Event type: ${opts.eventType}

The 9 top-pick photos to plan:
${photoLines}

Plan the 9-post Color-Block Editorial feed. Output strict JSON only.`
}

interface FeedRequestBody {
  clientId?: string
  style?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  if (!supabase) return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'anthropic_not_configured' })

  const body = (req.body || {}) as FeedRequestBody
  const clientId = String(body.clientId ?? '').trim()
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' })

  // Resolve client + business + galleries.
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

  // Pull top-picks across all galleries; pick the best 9 by sort_order.
  const { data: picks } = await supabase
    .from('images')
    .select('id, gallery_id, filename')
    .in('gallery_id', galleryIds)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(12)
  const photos9 = (picks ?? []).slice(0, 9).map(p => {
    const gallery = (galleries ?? []).find(g => g.id === p.gallery_id)
    return {
      image_id: p.id as string,
      filename: p.filename as string,
      gallery_name: (gallery?.name as string) || 'event',
    }
  })
  if (photos9.length < 9)
    return res.status(409).json({ ok: false, error: 'need_at_least_9_top_picks', have: photos9.length })

  // Event type: pull from the first gallery's delivery_settings, default 'event'.
  const firstSettings = (galleries?.[0]?.delivery_settings || {}) as Record<string, unknown>
  const eventType = (firstSettings.eventType as string) || 'event'

  // Single Claude call. Sonnet is the right tradeoff: fast enough for the
  // 25-second demo, smart enough for the hebrew + reasoning quality. Opus is
  // overkill for 9 captions; Haiku misses brand voice.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let llmText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserMessage({
            businessName: business.business_name as string,
            clientName: client.name as string,
            eventType,
            photos: photos9,
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

  // Strict-JSON parsing. Strip leading/trailing fluff if Claude adds any.
  const jsonStart = llmText.indexOf('{')
  const jsonEnd = llmText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1)
    return res.status(502).json({ ok: false, error: 'llm_returned_no_json' })
  let parsed: { posts?: PostPlan[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch {
    return res.status(502).json({ ok: false, error: 'llm_returned_bad_json' })
  }

  const posts = parsed.posts ?? []
  if (!Array.isArray(posts) || posts.length !== 9)
    return res.status(502).json({ ok: false, error: 'llm_returned_wrong_count', count: posts.length })

  // Validate every post — colors enum, image_id matches our 9, position 1..9.
  const validImageIds = new Set(photos9.map(p => p.image_id))
  for (const p of posts) {
    if (!validImageIds.has(p.image_id))
      return res.status(502).json({ ok: false, error: 'llm_invalid_image_id', got: p.image_id })
    if (!COLOR_KEYS.includes(p.color))
      return res.status(502).json({ ok: false, error: 'llm_invalid_color', got: p.color })
    if (typeof p.position !== 'number' || p.position < 1 || p.position > 9)
      return res.status(502).json({ ok: false, error: 'llm_invalid_position', got: p.position })
  }

  // Persist as draft. Generated_by is null when called pre-auth (the
  // photographer-side dashboard). Photographer will accept it explicitly.
  const { data: plan, error: insertErr } = await supabase
    .from('feed_plans')
    .insert({
      business_id: business.id,
      client_id: client.id,
      source_gallery_ids: galleryIds,
      style: 'color_block_editorial',
      posts,
      brand_snapshot: {
        business_name: business.business_name,
        client_name: client.name,
        event_type: eventType,
      },
      llm_trace: {
        model: 'claude-sonnet-4-6',
        latency_ms: Date.now() - t0,
        prompt_chars: SYSTEM_PROMPT.length,
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
      posts: plan.posts,
      status: plan.status,
      created_at: plan.created_at,
    },
    traceMs: Date.now() - t0,
  })
}
