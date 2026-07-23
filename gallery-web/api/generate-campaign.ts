// generate-campaign.ts — the Creative Engine endpoint.
//
// Given a gallery + a 5-question quick brief, the AI returns FOUR creative
// directions. Each direction is a named visual identity (Swiss Editorial /
// Luxury Black / Festival Neon / Cinematic Atmosphere) with hand-coded
// design tokens (typography, palette, type scale) — the AI does NOT invent
// the design system. The AI fills in:
//   - which photos go in which layout slots (using image scores as priors)
//   - headline / sub / caption copy in the direction's voice
//   - per-photo crop focal point (preferring the score's suggestion)
//
// Output: a JSON tree the frontend renders into HTML/CSS compositions.
//
// Cost: ~$0.10–0.20 per generation (single Sonnet call, Hebrew output, no
// vision). Posts per direction: 4–6. Total compositions per call: 16–24.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { requireProductionOwnerOfClient } from '../server/entitlements.js'

export const maxDuration = 60

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

// ── Hand-coded design directions (the design system; AI does not change this)
const DIRECTIONS = {
  swiss_editorial: {
    label: 'Swiss Editorial',
    label_he: 'עיתונאי-שווייצרי',
    tagline: 'מינימליזם תקיף · טיפוגרפיה הדוקה · ניגוד גבוה',
    tokens: {
      bg_color: '#fafafa', text_color: '#0a0a0f', primary_color: '#0a0a0f',
      accent_color: '#E63946',
      font_display: "'Inter Tight', 'Inter', sans-serif",
      font_body: "'Inter', system-ui, sans-serif",
      typography_scale: 'balanced' as const,
      grain: 0,
    },
  },
  luxury_black: {
    label: 'Luxury Black',
    label_he: 'יוקרה כהה',
    tagline: 'שחור עמוק · זהב · טיפוגרפיה איטלקית',
    tokens: {
      bg_color: '#0a0a0f', text_color: '#fafafa', primary_color: '#fafafa',
      accent_color: '#C9A96E',
      font_display: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
      font_body: "'Inter', system-ui, sans-serif",
      typography_scale: 'minimal' as const,
      grain: 1,
    },
  },
  festival_neon: {
    label: 'Festival Neon',
    label_he: 'נאון פסטיבל',
    tagline: 'אנרגיה · אלכסונים · צבעים נועזים',
    tokens: {
      bg_color: '#1a0033', text_color: '#fafafa', primary_color: '#00FF88',
      accent_color: '#FF006E',
      font_display: "'Inter Tight', 'Bebas Neue', sans-serif",
      font_body: "'Inter', system-ui, sans-serif",
      typography_scale: 'dominant' as const,
      grain: 0,
    },
  },
  cinematic_atmosphere: {
    label: 'Cinematic Atmosphere',
    label_he: 'קולנועי-אווירה',
    tagline: 'גוון שעת זהב · letterbox · רגש נמוך',
    tokens: {
      bg_color: '#1a1410', text_color: '#f4e4bc', primary_color: '#f4e4bc',
      accent_color: '#b89968',
      font_display: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
      font_body: "'Inter', system-ui, sans-serif",
      typography_scale: 'balanced' as const,
      grain: 1,
    },
  },
} as const

const DIRECTION_IDS = Object.keys(DIRECTIONS) as Array<keyof typeof DIRECTIONS>

const VALID_LAYOUTS = [
  'headline-overlay',     // big text on top of full-bleed photo
  'color-block-frame',    // photo with thick color border + caption below
  'split-tile-3',         // ONE photo split across 3 carousel slides
  'typography-poster',    // no photo, designed text on color background
  'magazine-spread',      // portrait + headline beside it
  'duotone-portrait',     // photo with duotone color treatment
] as const
type LayoutId = typeof VALID_LAYOUTS[number]

interface Brief {
  formats: string[]      // ['single','carousel','poster']
  vibe: string           // 'luxury' | 'energetic' | 'editorial' | 'campaign' | 'cinematic'
  typography: string     // 'minimal' | 'dominant' | 'balanced'
  continuity: string     // 'fresh' | 'continue' | 'unsure'
  depth: string          // 'fast' | 'campaign'
}

interface RawPost {
  layout: LayoutId
  image_index?: number       // 1..N — for layouts that use one photo
  image_indexes?: number[]   // for split-tile-3 (3 indexes) and other multi-image
  headline: string
  sub?: string
  caption?: string
  align?: 'top' | 'center' | 'bottom'
}

interface RawDirection {
  id: keyof typeof DIRECTIONS
  posts: RawPost[]
}

interface ResolvedPost {
  id: string
  layout: LayoutId
  image_id?: string
  image_ids?: string[]
  crop?: { focalX: number; focalY: number }
  headline: string
  sub?: string
  caption?: string
  align?: 'top' | 'center' | 'bottom'
}

interface ResolvedDirection {
  id: keyof typeof DIRECTIONS
  label: string
  label_he: string
  tagline: string
  tokens: typeof DIRECTIONS[keyof typeof DIRECTIONS]['tokens']
  posts: ResolvedPost[]
}

interface CampaignBody {
  clientId?: string
  galleryId?: string
  brief?: Brief
  postsPerDirection?: number   // default 5
}

interface PhotoCtx {
  image_id: string
  filename: string
  hero?: number
  carousel?: number
  story?: number
  atmosphere?: number
  people?: number
  brand_fit?: number
  social?: number
  usage?: string
  rationale_he?: string
  focal_x?: number
  focal_y?: number
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return 'p_' + Math.random().toString(36).slice(2)
}

function buildSystemPrompt(): string {
  return `You are a senior Israeli creative director designing a piXflow Instagram CAMPAIGN. Output is composed visual designs — not curations. The design system, typography, and color palette are FIXED per direction; you do NOT pick those. You pick photos, write copy, and assign layouts.

DIRECTIONS (you must propose all four, in order):
- swiss_editorial — Minimal Swiss editorial. Tight Inter-Tight type. Lots of negative space. Hard edges. Use this for: clean editorial moments, single accent color.
- luxury_black — Deep blacks + gold + Playfair italic. Generous spacing. Use this for: gala atmosphere, prestige.
- festival_neon — Lime + magenta + deep purple, dominant typography, diagonal compositions. Use this for: high-energy events, music, crowds.
- cinematic_atmosphere — Sepia + cream + amber, Cormorant serif, golden-hour palette. Use this for: atmosphere, light, intimate moments.

LAYOUTS available per post:
- "headline-overlay"   — full-bleed photo with a giant headline overlay. needs: image_index, headline, sub?, align (top|center|bottom).
- "color-block-frame"  — photo cropped 4:5 inside a thick solid border, caption below. needs: image_index, headline, caption?
- "split-tile-3"       — ONE photo split across 3 swipeable carousel slides (image continues across the swipe). needs: image_indexes (3 entries — same image_index repeated 3x is REQUIRED), headline (shows on slide 1).
- "typography-poster"  — NO photo. Designed text card. needs: headline (4–8 Hebrew words), sub (10–18 Hebrew words).
- "magazine-spread"    — portrait photo on one side, big headline on the other. needs: image_index, headline, sub?
- "duotone-portrait"   — photo with duotone treatment (bg + accent color over photo). needs: image_index, headline, caption?

LAYOUT SELECTION RULES:
- Use a MIX of layouts per direction (e.g., 2 headline-overlay + 1 color-block-frame + 1 split-tile-3 + 1 typography-poster = 5 posts).
- swiss_editorial leans on color-block-frame and typography-poster.
- luxury_black leans on magazine-spread and duotone-portrait.
- festival_neon leans on headline-overlay and split-tile-3.
- cinematic_atmosphere leans on headline-overlay (align: bottom) and duotone-portrait.
- Use split-tile-3 once per direction MAX, only on a wide image with a clear horizon (so the split feels intentional).

PHOTO SELECTION RULES:
- Pick photos by their AI scores. headline-overlay → high atmosphere + brand_fit. magazine-spread → portraits (high people_density + faces). duotone-portrait → strong solo subject. typography-poster → no photo at all.
- For image_indexes on split-tile-3, ALL THREE entries must be the SAME index. The SAME photo gets split client-side; different photos would break the visual continuity.

COPY RULES:
- Headlines: 3–7 Hebrew words. Editorial. Confident. Present-tense. Examples: "הקהל פתח את הבמה", "כשהאור התחיל לדבר", "שום אירוע, רק רגעים". NEVER generic ("רגע מיוחד", "אירוע מושלם", "שווה לראות").
- Subs (where used): 10–18 Hebrew words. Lyrical, sensorial.
- Captions (the IG caption shown below the post in the feed): 8–14 Hebrew words. NO hashtags, NO emojis.
- Each direction's copy should have a distinct VOICE matching the design language: swiss = clipped + factual; luxury = poetic + restrained; festival = energetic + present-tense; cinematic = visual + atmospheric.

OUTPUT — STRICT JSON only, no markdown, no preamble:
{
  "directions": [
    {
      "id": "swiss_editorial",
      "posts": [
        { "layout": "headline-overlay", "image_index": 4, "headline": "...", "sub": "...", "align": "bottom" },
        { "layout": "color-block-frame", "image_index": 12, "headline": "...", "caption": "..." },
        { "layout": "typography-poster", "headline": "...", "sub": "..." },
        ... (postsPerDirection entries; mix layouts)
      ]
    },
    { "id": "luxury_black", "posts": [...] },
    { "id": "festival_neon", "posts": [...] },
    { "id": "cinematic_atmosphere", "posts": [...] }
  ]
}`
}

function buildUserMessage(opts: {
  businessName: string
  clientName: string
  galleryName: string
  photos: PhotoCtx[]
  brief: Brief
  postsPerDirection: number
}): string {
  const photoLines = opts.photos
    .map((p, i) => {
      const sc = p.hero !== undefined
        ? ` · usage=${p.usage} hero=${p.hero} carousel=${p.carousel} atmo=${p.atmosphere} people=${p.people} brand=${p.brand_fit} social=${p.social}`
        : ' · (not yet scored)'
      const r = p.rationale_he ? ` · "${p.rationale_he}"` : ''
      return `[${i + 1}] file="${p.filename}"${sc}${r}`
    })
    .join('\n')

  return `Brand: ${opts.businessName} (Israeli production-company photographer)
Client: ${opts.clientName}
EVENT: ${opts.galleryName}

QUICK BRIEF:
- formats: ${opts.brief.formats.join(', ')}
- vibe: ${opts.brief.vibe}
- typography: ${opts.brief.typography}
- continuity: ${opts.brief.continuity}
- depth: ${opts.brief.depth}

PHOTOS (${opts.photos.length} top picks; reference by bracketed integer index 1..${opts.photos.length}):
${photoLines}

Generate 4 directions, each with ${opts.postsPerDirection} composed posts. Use ONLY the listed layouts. Output strict JSON only.`
}

async function handler(req: VercelRequest, res: VercelResponse) {
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

  const body = (req.body || {}) as CampaignBody
  const clientId = String(body.clientId ?? '').trim()
  const galleryId = String(body.galleryId ?? '').trim()
  const brief = body.brief
  const postsPerDirection = Math.max(3, Math.min(8, Number(body.postsPerDirection ?? 5)))

  if (!clientId || !galleryId)
    return res.status(400).json({ ok: false, error: 'clientId_and_galleryId_required' })
  if (!brief || typeof brief !== 'object')
    return res.status(400).json({ ok: false, error: 'brief_required' })

  // Blocker 2 gate: authenticated owner of this client only, before any AI call.
  const gate = await requireProductionOwnerOfClient(req, supabase, clientId)
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.code })

  const { data: client } = await supabase
    .from('clients').select('id, name, business_id').eq('id', clientId).maybeSingle()
  if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' })

  const { data: business } = await supabase
    .from('businesses').select('id, business_name').eq('id', client.business_id).maybeSingle()
  if (!business) return res.status(404).json({ ok: false, error: 'business_not_found' })

  const { data: gallery } = await supabase
    .from('galleries').select('id, name, client_id').eq('id', galleryId).maybeSingle()
  if (!gallery) return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  if (gallery.client_id !== clientId)
    return res.status(403).json({ ok: false, error: 'gallery_not_owned_by_client' })

  const { data: picks } = await supabase
    .from('images').select('id, filename')
    .eq('gallery_id', galleryId).eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(20)
  if (!picks || picks.length === 0)
    return res.status(409).json({ ok: false, error: 'no_top_picks_in_gallery' })

  const { data: scoreRows } = await supabase
    .from('image_ai_scores')
    .select('image_id, hero_score, carousel_score, story_score, atmosphere_score, people_density, brand_fit, social_potential, suggested_usage, rationale_he, suggested_crop_focal_x, suggested_crop_focal_y')
    .in('image_id', picks.map(p => p.id))
  const scoreById = new Map((scoreRows ?? []).map(s => [s.image_id as string, s] as const))

  const photos: PhotoCtx[] = picks.map(p => {
    const s = scoreById.get(p.id as string)
    return {
      image_id: p.id as string,
      filename: p.filename as string,
      hero: s ? Number(s.hero_score) : undefined,
      carousel: s ? Number(s.carousel_score) : undefined,
      story: s ? Number(s.story_score) : undefined,
      atmosphere: s ? Number(s.atmosphere_score) : undefined,
      people: s ? Number(s.people_density) : undefined,
      brand_fit: s ? Number(s.brand_fit) : undefined,
      social: s ? Number(s.social_potential) : undefined,
      usage: s ? s.suggested_usage as string : undefined,
      rationale_he: s ? s.rationale_he as string : undefined,
      focal_x: s ? Number(s.suggested_crop_focal_x) : undefined,
      focal_y: s ? Number(s.suggested_crop_focal_y) : undefined,
    }
  })

  const indexToId = new Map<number, string>(photos.map((p, i) => [i + 1, p.image_id]))
  const indexToFocal = new Map<number, { x: number; y: number }>(
    photos.flatMap((p, i) => p.focal_x !== undefined && p.focal_y !== undefined
      ? [[i + 1, { x: p.focal_x, y: p.focal_y }] as const]
      : []),
  )

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let llmText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: [
        { type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: buildUserMessage({
          businessName: business.business_name as string,
          clientName: client.name as string,
          galleryName: gallery.name as string,
          photos,
          brief,
          postsPerDirection,
        }),
      }],
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
    return res.status(502).json({
      ok: false, error: 'llm_returned_no_json',
      ...(process.env.NODE_ENV !== 'production' ? { tail: llmText.slice(-300), length: llmText.length } : {}),
    })

  let parsed: { directions?: RawDirection[] } = {}
  try {
    parsed = JSON.parse(llmText.slice(jsonStart, jsonEnd + 1))
  } catch (parseErr) {
    return res.status(502).json({
      ok: false, error: 'llm_returned_bad_json',
      detail: parseErr instanceof Error ? parseErr.message.slice(0, 120) : 'parse error',
      ...(process.env.NODE_ENV !== 'production' ? { tail: llmText.slice(-400), length: llmText.length } : {}),
    })
  }

  const rawDirections = parsed.directions ?? []
  if (!Array.isArray(rawDirections) || rawDirections.length === 0)
    return res.status(502).json({ ok: false, error: 'llm_returned_no_directions' })

  // Resolve indices → image_ids; merge in hand-coded tokens.
  const resolved: ResolvedDirection[] = []
  for (const d of rawDirections) {
    if (!DIRECTION_IDS.includes(d.id)) continue
    const directionMeta = DIRECTIONS[d.id]
    const posts: ResolvedPost[] = []
    for (const p of d.posts ?? []) {
      if (!VALID_LAYOUTS.includes(p.layout)) continue
      const headline = String(p.headline ?? '').trim()
      if (!headline && p.layout !== 'split-tile-3') continue

      if (p.layout === 'typography-poster') {
        posts.push({
          id: newId(), layout: p.layout,
          headline,
          sub: p.sub ? String(p.sub) : undefined,
          align: p.align,
        })
        continue
      }

      if (p.layout === 'split-tile-3') {
        const idxs = (p.image_indexes ?? []).map(Number).filter(n => indexToId.has(n))
        if (idxs.length < 1) continue
        // Force same image across 3 slides for visual continuity.
        const idx = idxs[0]
        const id = indexToId.get(idx)!
        const focal = indexToFocal.get(idx)
        posts.push({
          id: newId(), layout: p.layout,
          image_ids: [id, id, id],
          crop: focal ? { focalX: focal.x, focalY: focal.y } : undefined,
          headline,
          sub: p.sub ? String(p.sub) : undefined,
          caption: p.caption ? String(p.caption) : undefined,
          align: p.align,
        })
        continue
      }

      // Single-image layouts.
      const idx = Number(p.image_index)
      const id = indexToId.get(idx)
      if (!id) continue
      const focal = indexToFocal.get(idx)
      posts.push({
        id: newId(), layout: p.layout,
        image_id: id,
        crop: focal ? { focalX: focal.x, focalY: focal.y } : undefined,
        headline,
        sub: p.sub ? String(p.sub) : undefined,
        caption: p.caption ? String(p.caption) : undefined,
        align: p.align,
      })
    }

    if (posts.length === 0) continue

    resolved.push({
      id: d.id,
      label: directionMeta.label,
      label_he: directionMeta.label_he,
      tagline: directionMeta.tagline,
      tokens: directionMeta.tokens,
      posts,
    })
  }

  if (resolved.length === 0)
    return res.status(502).json({ ok: false, error: 'no_valid_posts_after_resolution' })

  return res.status(200).json({
    ok: true,
    galleryId,
    galleryName: gallery.name,
    directions: resolved,
    trace_ms: Date.now() - t0,
  })
}

export default withSentry('generate-campaign', handler)
