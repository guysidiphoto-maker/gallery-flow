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

  // Cron-only gate: Vercel cron sends `x-vercel-cron: 1`. If CRON_SECRET is
  // configured, also accept `authorization: Bearer <CRON_SECRET>` for manual
  // re-runs from the dashboard. Without this gate any public caller can
  // trigger up to 50 Twilio SMS resends per invocation.
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization']
  const hasManualSecret =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isVercelCron && !hasManualSecret) {
    return res.status(401).json({ error: 'unauthorized' })
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
