import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isPublicFormsEnabled, isUuid, isValidEmail, cleanText, clientIp,
  maskPhone, maskEmail, countSince, verifyTurnstileToken,
} from '../server/publicEndpointGuards.js'
import { withSentry, captureApiError } from '../server/sentryServer.js'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

// ── Abuse limits (SINGLE SOURCE OF TRUTH for this endpoint) ───────────────────
// Over the limit, the response is still PERSISTED — only the cost-bearing
// SMS/email notification is withheld.
const RESP_MAX_PER_QUESTIONNAIRE_PER_MIN = 60  // burst cap per questionnaire / 60s
const RESP_MAX_PER_CONTACT_PER_HOUR = 5        // same email/phone / 3600s
const NAME_MAX = 80
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

async function handler(req: VercelRequest, res: VercelResponse) {
  // Emergency kill switch.
  if (!isPublicFormsEnabled()) {
    return res.status(404).json({ error: 'This endpoint is not enabled' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { questionnaireId, respondentName, respondentPhone, respondentEmail, answers, turnstileToken } = req.body || {}
  const ip = clientIp(req)

  // ── Input validation ──────────────────────────────────────────────────────
  if (!isUuid(questionnaireId)) {
    return res.status(400).json({ ok: false, error: 'missing_questionnaire_id' })
  }
  const name = cleanText(respondentName, NAME_MAX)
  if (!name) {
    return res.status(400).json({ ok: false, error: 'missing_name' })
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ ok: false, error: 'missing_answers' })
  }
  if (JSON.stringify(answers).length > ANSWERS_MAX_BYTES) {
    return res.status(400).json({ ok: false, error: 'answers_too_large' })
  }
  const phone = cleanText(respondentPhone, 40) || null
  let email: string | null = null
  const rawEmail = cleanText(respondentEmail, 254)
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' })
    }
    email = rawEmail
  }

  // ── Turnstile (end-to-end): hard-block ONLY a definitively invalid token. ──
  const ts = await verifyTurnstileToken(cleanText(turnstileToken, 4096), ip)
  if (ts === 'invalid') {
    console.warn(`[submit-questionnaire] blocked reason=turnstile questionnaire=${questionnaireId} ip=${ip}`)
    return res.status(400).json({ ok: false, error: 'turnstile_failed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ ok: false, error: 'Server misconfigured' })
  const supabase = createClient(SUPABASE_URL, serviceKey)

  try {
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

    // Validate required questions
    const questions = questionnaire.questions as { id: string; label: string; required: boolean }[]
    for (const q of questions) {
      if (q.required && (!answers[q.id] || typeof answers[q.id] !== 'string' || !answers[q.id].trim())) {
        return res.status(400).json({ ok: false, error: 'missing_required', field: q.id })
      }
    }

    // ── Rate limiting computed BEFORE the insert, so the current request's own
    // row is NOT counted (mirrors capture-lead.ts). Over the limit, the
    // response is still saved but SMS/email are withheld. ──
    const perQuestionnaire = await countSince(supabase, 'questionnaire_responses', 'questionnaire_id', questionnaireId, 60)
    const contactCol = phone ? 'respondent_phone' : email ? 'respondent_email' : null
    const contactVal = phone || email || ''
    const perContact = contactCol ? await countSince(supabase, 'questionnaire_responses', contactCol, contactVal, 3600) : 0
    const withholdNotify =
      perQuestionnaire >= RESP_MAX_PER_QUESTIONNAIRE_PER_MIN || perContact >= RESP_MAX_PER_CONTACT_PER_HOUR

    // Insert response (preserve data before any notification)
    const { error: insertErr } = await supabase
      .from('questionnaire_responses')
      .insert({
        questionnaire_id: questionnaireId,
        respondent_name: name,
        respondent_phone: phone,
        respondent_email: email,
        answers,
      })

    if (insertErr) {
      await captureApiError(insertErr, { endpoint: 'submit-questionnaire', action: 'insert_response', status: 500, questionnaireId, reason: 'storage_failed' })
      return res.status(500).json({ ok: false, error: 'storage_failed' })
    }

    if (withholdNotify) {
      console.warn(`[submit-questionnaire] notify withheld reason=rate questionnaire=${questionnaireId} contact=${phone ? maskPhone(phone) : maskEmail(email ?? '')} ip=${ip}`)
      return res.status(200).json({ ok: true, smsSent: false, emailSent: false, reason: 'rate_limited' })
    }

    // Build gallery URL if a gallery is linked.
    const galleryUrl = questionnaire.gallery_id
      ? `https://pixflow-ai.com/gallery/${questionnaire.gallery_id}`
      : null

    // ── Send SMS if configured ──
    let smsSent = false
    if (questionnaire.send_method === 'sms' && phone) {
      const normalized = normalizePhone(phone)
      if (normalized) {
        const result = await sendSms(normalized, name, galleryUrl)
        smsSent = result.ok
        if (!result.ok) {
          console.warn(`[submit-questionnaire] sms failed to=${maskPhone(normalized)}: ${result.error}`)
        }
      }
    }

    // ── Send email if configured ──
    let emailSent = false
    if (questionnaire.send_method === 'email' && email) {
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
            console.warn(`[submit-questionnaire] email failed to=${maskEmail(email)}: HTTP ${resp.status}`)
          }
        } catch (err) {
          console.warn('[submit-questionnaire] email error:', err instanceof Error ? err.message : err)
        }
      }
    }

    return res.status(200).json({ ok: true, smsSent, emailSent })
  } catch (err) {
    await captureApiError(err, { endpoint: 'submit-questionnaire', status: 500, questionnaireId, reason: 'unhandled' })
    return res.status(500).json({ ok: false, error: 'internal_error' })
  }
}

export default withSentry('submit-questionnaire', handler)
