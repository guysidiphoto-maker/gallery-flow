import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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
