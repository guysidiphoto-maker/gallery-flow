import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { questionnaireId, respondentName, respondentPhone, respondentEmail, answers } = req.body || {}

  if (!questionnaireId || typeof questionnaireId !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_questionnaire_id' })
  }
  if (!respondentName || typeof respondentName !== 'string' || respondentName.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'missing_name' })
  }
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ ok: false, error: 'missing_answers' })
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

  // Validate required questions
  const questions = questionnaire.questions as { id: string; label: string; required: boolean }[]
  for (const q of questions) {
    if (q.required && (!answers[q.id] || typeof answers[q.id] !== 'string' || !answers[q.id].trim())) {
      return res.status(400).json({ ok: false, error: 'missing_required', field: q.id })
    }
  }

  // Insert response
  const { error: insertErr } = await supabase
    .from('questionnaire_responses')
    .insert({
      questionnaire_id: questionnaireId,
      respondent_name: respondentName.trim(),
      respondent_phone: respondentPhone || null,
      respondent_email: respondentEmail || null,
      answers,
    })

  if (insertErr) {
    console.error('[submit-questionnaire] insert error:', insertErr.message)
    return res.status(500).json({ ok: false, error: 'storage_failed' })
  }

  // ── Send SMS if configured ──
  let smsSent = false
  console.log('[submit-questionnaire] send_method:', questionnaire.send_method, 'phone:', respondentPhone)
  if (questionnaire.send_method === 'sms' && respondentPhone) {
    const normalized = normalizePhone(respondentPhone)
    if (normalized) {
      // Build gallery URL if gallery is linked
      let galleryUrl: string | null = null
      if (questionnaire.gallery_id) {
        galleryUrl = `https://pixflow-ai.com/gallery/${questionnaire.gallery_id}`
      }

      console.log('[submit-questionnaire] Sending SMS to', normalized, 'gallery:', galleryUrl)
      const result = await sendSms(normalized, respondentName.trim(), galleryUrl)
      smsSent = result.ok
      console.log('[submit-questionnaire] SMS result:', JSON.stringify(result))
      if (!result.ok) {
        console.error('[submit-questionnaire] SMS error:', result.error)
      }
    }
  }

  // ── Send email if configured ──
  let emailSent = false
  if (questionnaire.send_method === 'email' && respondentEmail) {
    let galleryUrl: string | null = null
    if (questionnaire.gallery_id) {
      galleryUrl = `https://pixflow-ai.com/gallery/${questionnaire.gallery_id}`
    }

    const resendKey = process.env.RESEND_API_KEY
    console.log('[submit-questionnaire] RESEND_API_KEY exists:', !!resendKey, 'email:', respondentEmail)
    if (resendKey) {
      try {
        const name = respondentName.trim()

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
            to: [respondentEmail.trim()],
            subject: 'תודה שמילאת את השאלון 📸',
            html,
          }),
        })

        const data = await resp.json()
        emailSent = resp.ok
        if (!resp.ok) {
          console.error('[submit-questionnaire] Email error:', JSON.stringify(data))
        }
      } catch (err) {
        console.error('[submit-questionnaire] Email error:', err instanceof Error ? err.message : err)
      }
    }
  }

  return res.status(200).json({ ok: true, smsSent, emailSent })
}
