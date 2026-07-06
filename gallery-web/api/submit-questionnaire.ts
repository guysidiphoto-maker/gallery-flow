import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isUuid, isValidEmail, cleanText, clientIp, maskPhone, maskEmail,
  countSince, verifyTurnstile,
} from '../server/publicEndpointGuards.js'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

// Abuse limits (persistent, counted from questionnaire_responses.created_at).
const RESP_MAX_PER_QUESTIONNAIRE_PER_MIN = 25  // burst cap per questionnaire / 60s
const RESP_MAX_PER_CONTACT_PER_HOUR = 5        // same email/phone / 3600s
const NAME_MAX = 80
const ANSWER_MAX = 2000                        // per-answer char cap
const ANSWERS_MAX_BYTES = 20000                // reject pathological payloads

// ─── Phone normalization ────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')
  if (/^\+9725[0-9]\d{7}$/.test(digits)) return digits
  if (/^05[0-9]\d{7}$/.test(digits)) return '+972' + digits.slice(1)
  if (/^9725[0-9]\d{7}$/.test(digits)) return '+' + digits
  return null
}

// ─── SMS via Twilio ─────────────────────────────────────────────────────────

async function sendSms(
  phone: string,
  name: string,
  galleryUrl: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'SMS not configured' }
  }

  let body = `היי ${name}! 📸\nתודה שמילאת את השאלון.`
  if (galleryUrl) {
    body += `\nצפה בגלריה שלך כאן:\n${galleryUrl}`
  }

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

    if (!resp.ok) {
      const data = await resp.json()
      return { ok: false, error: data?.message || `HTTP ${resp.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // OFF by default — this public questionnaire form is not part of the current
  // launch. Return a clean disabled response before ANY work (no SMS, no email,
  // no Supabase write, no provider call). Flip PUBLIC_FORMS_ENABLED=true to
  // re-enable; the validation + rate-limit protections stay active behind it.
  if (process.env.PUBLIC_FORMS_ENABLED !== 'true') {
    return res.status(404).json({ error: 'This endpoint is not enabled' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { questionnaireId, respondentName, respondentPhone, respondentEmail, answers } = req.body || {}
  const ip = clientIp(req)

  // ── Input validation ──────────────────────────────────────────────────────
  if (!isUuid(questionnaireId)) {
    return res.status(400).json({ ok: false, error: 'missing_questionnaire_id' })
  }
  const name = cleanText(respondentName, NAME_MAX)
  if (!name) {
    return res.status(400).json({ ok: false, error: 'missing_name' })
  }
  let email: string | null = null
  const rawEmail = cleanText(respondentEmail, 254)
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' })
    }
    email = rawEmail
  }
  const rawPhone = cleanText(respondentPhone, 40)
  const phone = rawPhone || null

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ ok: false, error: 'missing_answers' })
  }
  // Reject pathological payloads, then cap + coerce each answer to a string.
  if (JSON.stringify(answers).length > ANSWERS_MAX_BYTES) {
    return res.status(400).json({ ok: false, error: 'payload_too_large' })
  }
  const cleanAnswers: Record<string, string> = {}
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length > 120) continue
    cleanAnswers[k] = cleanText(v, ANSWER_MAX)
  }

  // Turnstile verify-if-present (not hard-required yet — see report).
  const turnstileToken = cleanText(req.body?.turnstileToken, 4096)
  if (turnstileToken && !(await verifyTurnstile(turnstileToken, ip))) {
    console.warn(`[submit-questionnaire] blocked reason=turnstile q=${questionnaireId} ip=${ip}`)
    return res.status(400).json({ ok: false, error: 'turnstile_failed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ ok: false, error: 'Server misconfigured' })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  // Fetch questionnaire with send_method and gallery info
  const { data: questionnaire, error: qErr } = await supabase
    .from('questionnaires')
    .select('id, questions, is_active, send_method, gallery_id')
    .eq('id', questionnaireId)
    .single()

  if (qErr || !questionnaire) {
    return res.status(404).json({ ok: false, error: 'questionnaire_not_found' })
  }
  if (!questionnaire.is_active) {
    return res.status(410).json({ ok: false, error: 'questionnaire_closed' })
  }

  // ── Rate limiting (persistent: counts questionnaire_responses in the window) ─
  const perQ = await countSince(supabase, 'questionnaire_responses', 'questionnaire_id', questionnaireId, 60)
  if (perQ >= RESP_MAX_PER_QUESTIONNAIRE_PER_MIN) {
    console.warn(`[submit-questionnaire] blocked reason=rate_q q=${questionnaireId} ip=${ip} count=${perQ}`)
    return res.status(429).json({ ok: false, error: 'rate_limited', retry_after_seconds: 60 })
  }
  if (email) {
    const perEmail = await countSince(supabase, 'questionnaire_responses', 'respondent_email', email, 3600)
    if (perEmail >= RESP_MAX_PER_CONTACT_PER_HOUR) {
      console.warn(`[submit-questionnaire] blocked reason=rate_email email=${maskEmail(email)} ip=${ip} count=${perEmail}`)
      return res.status(429).json({ ok: false, error: 'rate_limited', retry_after_seconds: 3600 })
    }
  }
  if (phone) {
    const perPhone = await countSince(supabase, 'questionnaire_responses', 'respondent_phone', phone, 3600)
    if (perPhone >= RESP_MAX_PER_CONTACT_PER_HOUR) {
      console.warn(`[submit-questionnaire] blocked reason=rate_phone phone=${maskPhone(phone)} ip=${ip} count=${perPhone}`)
      return res.status(429).json({ ok: false, error: 'rate_limited', retry_after_seconds: 3600 })
    }
  }

  // Validate required questions (against the cleaned answers)
  const questions = questionnaire.questions as { id: string; label: string; required: boolean }[]
  for (const q of questions) {
    if (q.required && !cleanAnswers[q.id]?.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_required', field: q.id })
    }
  }

  // Insert response
  const { error: insertErr } = await supabase
    .from('questionnaire_responses')
    .insert({
      questionnaire_id: questionnaireId,
      respondent_name: name,
      respondent_phone: phone,
      respondent_email: email,
      answers: cleanAnswers,
    })

  if (insertErr) {
    console.error('[submit-questionnaire] insert error:', insertErr.message)
    return res.status(500).json({ ok: false, error: 'storage_failed' })
  }

  // ── Send SMS if configured ──
  let smsSent = false
  if (questionnaire.send_method === 'sms' && phone) {
    const normalized = normalizePhone(phone)
    if (normalized) {
      // Build gallery URL if gallery is linked
      let galleryUrl: string | null = null
      if (questionnaire.gallery_id) {
        galleryUrl = `https://pixflow-ai.com/gallery/${questionnaire.gallery_id}`
      }

      const result = await sendSms(normalized, name, galleryUrl)
      smsSent = result.ok
      if (!result.ok) {
        // Provider error stays server-side; never surfaced to the client.
        console.error(`[submit-questionnaire] SMS failed q=${questionnaireId} to=${maskPhone(normalized)}`)
      }
    }
  }

  // ── Send email if configured ──
  let emailSent = false
  if (questionnaire.send_method === 'email' && email) {
    let galleryUrl: string | null = null
    if (questionnaire.gallery_id) {
      galleryUrl = `https://pixflow-ai.com/gallery/${questionnaire.gallery_id}`
    }

    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {

        const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Logo bar -->
        <tr><td style="padding:24px 32px;text-align:center;border-bottom:1px solid #eee;">
          <span style="font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:-0.5px;">Pi<span style="color:#6366f1;">x</span>flow</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 32px;">
          <p style="margin:0 0 20px;font-size:16px;color:#1a1a2e;line-height:1.7;text-align:right;">
            היי ${name},<br>תודה על הפרטים שמילאת!
          </p>

          ${galleryUrl ? `
          <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;text-align:right;">
            הגלריה שלך מוכנה. לחץ על הכפתור למטה כדי לצפות בתמונות ולזהות את עצמך באמצעות זיהוי פנים.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${galleryUrl}" style="display:inline-block;padding:14px 40px;background:#6366f1;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">צפה בגלריה</a>
            </td></tr>
          </table>
          ` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Pixflow AI by Eclipse Media
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Pixflow <noreply@pixflow-ai.com>',
            to: [email],
            subject: 'תודה שמילאת את השאלון 📸',
            html,
          }),
        })

        emailSent = resp.ok
        if (!resp.ok) {
          // PII-safe: log status + masked recipient, not the provider payload.
          console.error(`[submit-questionnaire] Email failed q=${questionnaireId} to=${maskEmail(email)} status=${resp.status}`)
        }
      } catch (err) {
        console.error('[submit-questionnaire] Email error:', err instanceof Error ? err.message : err)
      }
    }
  }

  return res.status(200).json({ ok: true, smsSent, emailSent })
}
