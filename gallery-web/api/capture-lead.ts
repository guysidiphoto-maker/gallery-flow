import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isPublicFormsEnabled, isUuid, isValidEmail, cleanText, clientIp, maskPhone,
  countSince, verifyTurnstileToken,
} from '../server/publicEndpointGuards.js'
import { withSentry, captureApiError } from '../server/sentryServer.js'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

// ── Abuse limits (SINGLE SOURCE OF TRUTH for this endpoint) ───────────────────
// Persistent, counted from event_leads.created_at (survives serverless cold
// starts). Over the limit, the lead is still PERSISTED and the gallery URL is
// still returned — only the cost-bearing SMS is withheld. See reconciliation
// report for the value rationale.
const LEAD_MAX_PER_EVENT_PER_MIN = 60    // simultaneous QR scans at a large event
const LEAD_MAX_PER_PHONE_PER_HOUR = 5    // same phone across events / 3600s
const GUEST_NAME_MAX = 80                // truncated before it enters the SMS body

// ─── Phone normalization ────────────────────────────────────────────────────

/** Normalize an Israeli mobile number to E.164 format (+972...) */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')
  if (/^\+9725[0-9]\d{7}$/.test(digits)) return digits
  if (/^05[0-9]\d{7}$/.test(digits)) return '+972' + digits.slice(1)
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
        body: new URLSearchParams({ To: phone, From: fromNumber, Body: body }),
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

// ─── Handler ────────────────────────────────────────────────────────────────

async function handler(req: VercelRequest, res: VercelResponse) {
  // Emergency kill switch — return a clean disabled response before ANY work.
  if (!isPublicFormsEnabled()) {
    return res.status(404).json({ error: 'This endpoint is not enabled' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, name, phone, email, turnstileToken } = req.body || {}
  const ip = clientIp(req)

  // ── Input validation (reject garbage before any provider/DB work) ──────────
  if (!isUuid(eventId)) {
    return res.status(400).json({ ok: false, error: 'invalid_event' })
  }
  const guestName = cleanText(name, GUEST_NAME_MAX)
  if (!guestName) {
    return res.status(400).json({ ok: false, error: 'missing_name', message: 'נא להזין שם מלא' })
  }
  const normalizedPhone = normalizePhone(cleanText(phone, 40))
  if (!normalizedPhone) {
    return res.status(400).json({ ok: false, error: 'invalid_phone', message: 'מספר הטלפון לא תקין' })
  }
  let guestEmail: string | null = null
  const rawEmail = cleanText(email, 254)
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email', message: 'כתובת האימייל לא תקינה' })
    }
    guestEmail = rawEmail
  }

  // ── Turnstile (end-to-end): hard-block ONLY a definitively invalid token.
  // 'absent'/'unavailable' fall through to the rate limiter so a Cloudflare
  // outage or a widget that failed to load never blocks a real guest.
  const ts = await verifyTurnstileToken(cleanText(turnstileToken, 4096), ip)
  if (ts === 'invalid') {
    console.warn(`[capture-lead] blocked reason=turnstile event=${eventId} ip=${ip}`)
    return res.status(400).json({ ok: false, error: 'turnstile_failed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ ok: false, error: 'Server misconfigured' })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  try {
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

    // ── Rate limiting (persistent DB row-count). Over the limit we WITHHOLD the
    // SMS but still persist the lead and return the gallery URL, so a legit
    // guest at a busy event still gets access on-screen and the photographer
    // still captures the contact. ──
    const perEvent = await countSince(supabase, 'event_leads', 'event_id', eventId, 60)
    const perPhone = await countSince(supabase, 'event_leads', 'phone', normalizedPhone, 3600)
    const withholdSms =
      perEvent >= LEAD_MAX_PER_EVENT_PER_MIN || perPhone >= LEAD_MAX_PER_PHONE_PER_HOUR
    if (withholdSms) {
      console.warn(`[capture-lead] sms withheld reason=rate event=${eventId} phone=${maskPhone(normalizedPhone)} ip=${ip} perEvent=${perEvent} perPhone=${perPhone}`)
    }

    // Upsert lead (preserve data; dedupe by event+phone)
    const { data: lead, error: insertErr } = await supabase
      .from('event_leads')
      .upsert(
        {
          event_id: eventId,
          name: guestName,
          phone: normalizedPhone,
          email: guestEmail,
          whatsapp_status: 'pending',
        },
        { onConflict: 'event_id,phone' },
      )
      .select('id, whatsapp_status, whatsapp_message_id')
      .single()

    if (insertErr) {
      await captureApiError(insertErr, { endpoint: 'capture-lead', action: 'upsert_lead', status: 500, eventId, reason: 'storage_failed' })
      return res.status(500).json({ ok: false, error: 'storage_failed' })
    }

    // Already delivered — don't re-send.
    if (lead.whatsapp_status === 'sent' && lead.whatsapp_message_id) {
      return res.status(200).json({ ok: true, galleryUrl: event.gallery_url, smsSent: true, duplicate: true })
    }

    // Rate-limited: lead is saved, SMS withheld, gallery link still returned.
    if (withholdSms) {
      await supabase
        .from('event_leads')
        .update({ whatsapp_status: 'pending', whatsapp_error: 'rate_limited' })
        .eq('id', lead.id)
      return res.status(200).json({ ok: true, galleryUrl: event.gallery_url, smsSent: false, reason: 'rate_limited' })
    }

    // Send SMS (one inline retry on failure)
    let result = await sendSms(normalizedPhone, guestName, event.gallery_url)
    if (!result.ok) {
      await new Promise(r => setTimeout(r, 2000))
      result = await sendSms(normalizedPhone, guestName, event.gallery_url)
    }

    await supabase
      .from('event_leads')
      .update({
        whatsapp_status: result.ok ? 'sent' : 'failed',
        whatsapp_message_id: result.messageId || null,
        whatsapp_error: result.error || null,
        retry_count: result.ok ? 0 : 1,
      })
      .eq('id', lead.id)

    return res.status(200).json({ ok: true, galleryUrl: event.gallery_url, smsSent: result.ok })
  } catch (err) {
    await captureApiError(err, { endpoint: 'capture-lead', status: 500, eventId, reason: 'unhandled' })
    return res.status(500).json({ ok: false, error: 'internal_error' })
  }
}

export default withSentry('capture-lead', handler)
