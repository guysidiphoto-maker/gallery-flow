import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const VALID_EVENT_TYPES = [
  'conference',
  'corporate-event',
  'government',
  'retreat-abroad',
  'retreat-local',
  'pre-event',
  'other',
]

const SYSTEM_PROMPT = `You are an assistant that analyzes event tender/RFP documents for a photography production company.
Given a tender description (in Hebrew or English), extract structured information about what kind of event photography is needed.

You MUST respond with valid JSON only, no other text. The JSON schema:
{
  "eventTypes": string[],    // from this list ONLY: ${VALID_EVENT_TYPES.join(', ')}
  "estimatedSize": string,   // "small" (<100 people), "medium" (100-500), "large" (500-2000), "xlarge" (2000+)
  "keywords": string[],      // relevant keywords for matching (e.g. "outdoor", "stage", "networking", "gala dinner")
  "location": string | null, // event location if mentioned
  "summary": string          // one-line Hebrew summary of what they need
}

Mapping hints for Hebrew terms:
- כנס, סמינר, ועידה → conference
- אירוע חברה, גיבוש, יום כיף, team building → corporate-event
- אירוע ממשלתי, טקס, ממלכתי → government
- נופש חו"ל, חו״ל → retreat-abroad
- נופש, נופש חברה → retreat-local
- קדם, pre-event → pre-event

If multiple event types apply, include all of them. If unsure, include "other" as a fallback.
Estimate the size from any number mentioned (e.g. "5000 איש" → "xlarge").`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty "text" field' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 5000) }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type' })
    }

    const parsed = JSON.parse(content.text)

    // Validate eventTypes
    if (Array.isArray(parsed.eventTypes)) {
      parsed.eventTypes = parsed.eventTypes.filter((t: string) => VALID_EVENT_TYPES.includes(t))
      if (parsed.eventTypes.length === 0) parsed.eventTypes = ['other']
    } else {
      parsed.eventTypes = ['other']
    }

    return res.status(200).json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analyze-tender]', message)
    return res.status(500).json({ error: 'Analysis failed', detail: message })
  }
}
