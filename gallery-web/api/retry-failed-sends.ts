import { serviceClient } from '../server/supabase.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { galleryReadySms, sendSms } from '../server/sms.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Cron-only (or a CRON_SECRET bearer for manual runs): otherwise any caller
  // could trigger up to 50 SMS resends per invocation.
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization']
  const hasManualSecret =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isVercelCron && !hasManualSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const supabase = serviceClient()
  if (!supabase) return res.status(500).json({ error: 'Server misconfigured' })

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

    const result = await sendSms(lead.phone, galleryReadySms(lead.name, galleryUrl))
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
