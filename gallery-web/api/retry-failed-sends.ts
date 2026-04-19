import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

async function sendWhatsApp(
  phone: string,
  guestName: string,
  galleryUrl: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'gallery_link_he'

  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'WhatsApp not configured' }
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'he' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: guestName },
                  { type: 'text', text: galleryUrl },
                ],
              },
            ],
          },
        }),
      },
    )

    const data = await resp.json()
    if (!resp.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` }
    }
    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET (Vercel Cron) or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server misconfigured' })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  // Fetch failed leads with retry_count < 3
  const { data: leads, error } = await supabase
    .from('event_leads')
    .select('id, name, phone, event_id, retry_count')
    .eq('whatsapp_status', 'failed')
    .lt('retry_count', 3)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error || !leads || leads.length === 0) {
    return res.status(200).json({ retried: 0 })
  }

  // Fetch event gallery URLs for these leads
  const eventIds = [...new Set(leads.map(l => l.event_id))]
  const { data: events } = await supabase
    .from('events')
    .select('id, gallery_url')
    .in('id', eventIds)

  const eventMap = new Map((events || []).map(e => [e.id, e.gallery_url]))

  let retried = 0
  let succeeded = 0

  for (const lead of leads) {
    const galleryUrl = eventMap.get(lead.event_id)
    if (!galleryUrl) continue

    const result = await sendWhatsApp(lead.phone, lead.name, galleryUrl)
    retried++

    await supabase
      .from('event_leads')
      .update({
        whatsapp_status: result.ok ? 'sent' : 'failed',
        whatsapp_message_id: result.messageId || null,
        whatsapp_error: result.error || null,
        retry_count: lead.retry_count + 1,
      })
      .eq('id', lead.id)

    if (result.ok) succeeded++
  }

  return res.status(200).json({ retried, succeeded })
}
