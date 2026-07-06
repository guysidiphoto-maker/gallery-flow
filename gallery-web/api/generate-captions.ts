import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { requireAuthedUser } from '../server/ownerAuth.js'

// Service-role client, used ONLY to validate the caller's JWT via GoTrue.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const authClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

interface PhotoInput {
  eventType?: string
  galleryName?: string
  filename?: string
}

const SYSTEM_PROMPT = `You are a social media copywriter for an Israeli photography & events production company.
Generate Instagram captions in the requested language for event photos.

Rules:
- Each caption: 2-3 lines of engaging text + relevant hashtags (5-8)
- Match the tone: professional / casual / creative
- Reference the event type naturally (conference, corporate event, retreat, etc.)
- Use emojis sparingly but effectively
- Include a call-to-action or question when appropriate
- For Hebrew: write naturally, not translated English. Use colloquial Israeli Hebrew.
- Each caption should feel unique, not templated

Respond with valid JSON only:
{ "captions": ["caption1", "caption2", ...] }`

async function handler(req: VercelRequest, res: VercelResponse) {
  // Origin/Referer allowlist gate (mirrors generate-feed.ts / generate-campaign.ts /
  // plan-event.ts / score-images.ts). Without it this is an open Claude proxy.
  const ALLOWED_ORIGINS = new Set([
    'https://pixflow-ai.com',
    'https://www.pixflow-ai.com',
  ])
  const origin = String(req.headers.origin ?? req.headers.referer ?? '')
  const isLocalDev = origin.startsWith('http://localhost')
  const isVercelPreview = /\.vercel\.app$/.test(new URL(origin || 'http://x').hostname || '')
  // Improvement over the sibling endpoints: a MISSING Origin AND Referer is a DENY
  // here (those endpoints let an absent Origin bypass the gate; the audit flagged it).
  if (!origin) return res.status(403).json({ error: 'origin_required' })
  if (!isLocalDev && !isVercelPreview) {
    try {
      const host = new URL(origin).origin
      if (!ALLOWED_ORIGINS.has(host)) {
        return res.status(403).json({ error: 'origin_not_allowed' })
      }
    } catch {
      return res.status(403).json({ error: 'invalid_origin' })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Blocker 2 gate: require a valid authenticated session before any paid
  // Anthropic call. This endpoint takes only free-text (no tenant resource), so
  // a logged-in user is sufficient — Origin alone is spoofable and not enough.
  if (!authClient) return res.status(500).json({ error: 'auth_not_configured' })
  const gate = await requireAuthedUser(req, authClient)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.code })

  const { photos, language = 'he', tone = 'professional' } = req.body || {}
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'Missing photos array' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const photoDescriptions = (photos as PhotoInput[])
    .map((p, i) => `${i + 1}. Gallery: "${p.galleryName || 'Event'}", Type: ${p.eventType || 'event'}, File: ${p.filename || 'photo'}`)
    .join('\n')

  const userMessage = `Generate ${photos.length} Instagram captions.

Language: ${language === 'he' ? 'Hebrew (עברית)' : 'English'}
Tone: ${tone}
Photos:
${photoDescriptions}

Generate one caption per photo.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return res.status(500).json({ error: 'Unexpected response' })

    const parsed = JSON.parse(content.text)
    return res.status(200).json(parsed)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-captions]', msg)
    return res.status(500).json({ error: 'Caption generation failed', detail: msg })
  }
}

export default withSentry('generate-captions', handler)
