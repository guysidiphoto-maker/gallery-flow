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
<body style="margin:0;padding:0;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06);">

        <!-- Header with gradient -->
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 32px 36px;text-align:center;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <!-- Camera icon -->
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.2);margin:0 auto 16px;line-height:56px;font-size:26px;">📸</div>
            <h1 style="margin:0 0 6px;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">תודה, ${name}!</h1>
            <p style="margin:0;color:rgba(255,255,255,.75);font-size:14px;">קיבלנו את התשובות שלך בהצלחה</p>
          </td></tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 28px;">
          <!-- Confirmation box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border-radius:12px;border:1px solid #ede9fe;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <div style="font-size:28px;margin-bottom:8px;">✅</div>
              <p style="margin:0;font-size:15px;color:#4c1d95;font-weight:600;">השאלון התקבל</p>
              <p style="margin:6px 0 0;font-size:13px;color:#7c3aed;">נחזור אליך בהקדם</p>
            </td></tr>
          </table>

          ${galleryUrl ? `
          <!-- Gallery button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td align="center">
              <a href="${galleryUrl}" style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 14px rgba(99,102,241,.35);">
                📷&nbsp;&nbsp;צפה בגלריה שלך
              </a>
            </td></tr>
          </table>
          ` : ''}

          <!-- Divider -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr><td style="border-top:1px solid #f0f0f5;padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                יש לך שאלות? ניתן להשיב על מייל זה<br>או לפנות אלינו בכל עת.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f5;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:right;">
                <span style="font-size:14px;font-weight:700;color:#6366f1;">Pixflow</span>
              </td>
              <td style="text-align:left;">
                <a href="https://pixflow-ai.com/terms" style="font-size:11px;color:#9ca3af;text-decoration:none;margin-left:12px;">תנאי שימוש</a>
                <a href="https://pixflow-ai.com/privacy" style="font-size:11px;color:#9ca3af;text-decoration:none;">פרטיות</a>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>

      <!-- Sub-footer -->
      <table width="520" cellpadding="0" cellspacing="0" style="margin-top:16px;">
        <tr><td align="center">
          <p style="margin:0;font-size:11px;color:#b0b0b0;">
            אקליפס מדיה · pixflow-ai.com
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
