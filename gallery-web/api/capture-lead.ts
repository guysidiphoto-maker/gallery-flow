import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

// ─── Phone normalization ────────────────────────────────────────────────────

/** Normalize an Israeli mobile number to E.164 format (+972...) */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')

  // Already E.164
  if (/^\+9725[0-9]\d{7}$/.test(digits)) return digits

  // Local format: 05X-XXXXXXX
  if (/^05[0-9]\d{7}$/.test(digits)) return '+972' + digits.slice(1)

  // With country code but no +
  if (/^9725[0-9]\d{7}$/.test(digits)) return '+' + digits

  return null
}

// ─── Twilio SMS ─────────────────────────────────────────────────────────────

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
      const errMsg = data?.message || `HTTP ${resp.status}`
      return { ok: false, error: errMsg }
    }

    return { ok: true, messageId: data?.sid }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, name, phone, email } = req.body || {}

  // Validate required fields
  if (!eventId || typeof eventId !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_event' })
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'missing_name', message: 'נא להזין שם מלא' })
  }

  const normalizedPhone = normalizePhone(phone || '')
  if (!normalizedPhone) {
    return res.status(400).json({ ok: false, error: 'invalid_phone', message: 'מספר הטלפון לא תקין' })
  }

  // Supabase service client (bypasses RLS for writes)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ ok: false, error: 'Server misconfigured' })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  // Fetch event
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, name, gallery_url, is_active')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) {
    return res.status(404).json({ ok: false, error: 'event_not_found' })
  }
  if (!event.is_active) {
    return res.status(410).json({ ok: false, error: 'event_closed', message: 'האירוע הזה כבר לא פעיל' })
  }

  // Upsert lead (handle duplicates gracefully)
  const { data: lead, error: insertErr } = await supabase
    .from('event_leads')
    .upsert(
      {
        event_id: eventId,
        name: name.trim(),
        phone: normalizedPhone,
        email: email?.trim() || null,
        whatsapp_status: 'pending',
      },
      { onConflict: 'event_id,phone' },
    )
    .select('id, whatsapp_status, whatsapp_message_id')
    .single()

  if (insertErr) {
    console.error('[capture-lead] insert error:', insertErr.message)
    return res.status(500).json({ ok: false, error: 'storage_failed' })
  }

  // If already sent successfully, skip re-send
  if (lead.whatsapp_status === 'sent' && lead.whatsapp_message_id) {
    return res.status(200).json({
      ok: true,
      galleryUrl: event.gallery_url,
      smsSent: true,
      duplicate: true,
    })
  }

  // Send SMS
  let result = await sendSms(normalizedPhone, name.trim(), event.gallery_url)

  // One inline retry on failure
  if (!result.ok) {
    await new Promise(r => setTimeout(r, 2000))
    result = await sendSms(normalizedPhone, name.trim(), event.gallery_url)
  }

  // Update lead status
  await supabase
    .from('event_leads')
    .update({
      whatsapp_status: result.ok ? 'sent' : 'failed',
      whatsapp_message_id: result.messageId || null,
      whatsapp_error: result.error || null,
      retry_count: result.ok ? 0 : 1,
    })
    .eq('id', lead.id)

  return res.status(200).json({
    ok: true,
    galleryUrl: event.gallery_url,
    smsSent: result.ok,
  })
}
