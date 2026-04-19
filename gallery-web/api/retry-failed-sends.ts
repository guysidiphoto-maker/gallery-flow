import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

async function sendSms(
  phone: string,
  guestName: string,
  galleryUrl: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'SMS not configured' }
  }

  const body = `היי ${guestName}! 📸\nהגלריה מהאירוע מוכנה.\nצפה בתמונות שלך כאן:\n${galleryUrl}`

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: fromNumber,
          Body: body,
        }),
      },
    )

    const data = await resp.json()
    if (!resp.ok) {
      return { ok: false, error: data?.message || `HTTP ${resp.status}` }
    }
    return { ok: true, messageId: data?.sid }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  // Fetch event gallery URLs
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

    const result = await sendSms(lead.phone, lead.name, galleryUrl)
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
