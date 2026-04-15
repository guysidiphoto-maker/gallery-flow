import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface MatchedGallery {
  name: string
  eventType: string
  date: string
  location: string
  imageCount: number
}

const SYSTEM_PROMPT = `You are an assistant for an Israeli photography production company.
The company received a tender/RFP and needs to show relevant photos from their portfolio.

You receive the tender text and a list of matching galleries from the company's existing work.
Write short descriptions in Hebrew that explain what's in each gallery and why it's relevant.

1. "intro" — One sentence in Hebrew summarizing what was found (e.g. "מצאנו 4 גלריות עם תמונות מכנסים ואירועים דומים").
2. "galleryDescriptions" — One short description (1 sentence) per gallery, in Hebrew, describing the event that was photographed.

Respond with valid JSON only:
{
  "intro": "string",
  "galleryDescriptions": ["string", "string", ...]
}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tenderText, matchedGalleries, businessName } = req.body || {}
  if (!tenderText || !matchedGalleries || !businessName) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  const gallerySummary = (matchedGalleries as MatchedGallery[])
    .map((g, i) => `${i + 1}. "${g.name}" — ${g.eventType}, ${g.location || 'N/A'}, ${g.imageCount} photos, ${g.date || 'N/A'}`)
    .join('\n')

  const userMessage = `Business name: ${businessName}

Original tender text:
${(tenderText as string).slice(0, 3000)}

Matched galleries from our portfolio:
${gallerySummary}

Generate the pitch intro and gallery descriptions.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type' })
    }

    const parsed = JSON.parse(content.text)
    return res.status(200).json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-pitch]', message)
    return res.status(500).json({ error: 'Generation failed', detail: message })
  }
}
