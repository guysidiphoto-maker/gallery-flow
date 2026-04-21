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
        const galleryButton = galleryUrl
          ? `<a href="${galleryUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;margin-top:24px;">צפה בגלריה</a>`
          : ''

        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Pixflow</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;text-align:center;">תודה שמילאת את השאלון!</h2>
          <p style="margin:0 0 24px;font-size:15px;color:#555;text-align:center;line-height:1.6;">
            היי ${respondentName.trim()}, קיבלנו את התשובות שלך בהצלחה.
          </p>
          ${galleryUrl ? `<div style="text-align:center;margin:24px 0;">
            <a href="${galleryUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">צפה בגלריה שלך</a>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;font-size:11px;color:#999;">
            הודעה זו נשלחה מ-Pixflow · <a href="https://pixflow-ai.com/privacy" style="color:#6366f1;">מדיניות פרטיות</a>
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
