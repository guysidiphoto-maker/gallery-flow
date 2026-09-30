// Twilio SMS helpers shared by the lead-capture, questionnaire and retry endpoints.

export type SmsResult = { ok: boolean; messageId?: string; error?: string }

/** Send one SMS via Twilio's REST API. Never throws; returns ok:false instead. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  if (!accountSid || !authToken || !fromNumber) return { ok: false, error: 'SMS not configured' }

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok) return { ok: false, error: data?.message || `HTTP ${resp.status}` }
    return { ok: true, messageId: data?.sid }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** Normalize an Israeli mobile number to E.164 (+9725XXXXXXXX), or null if invalid. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '')
  if (/^\+9725[0-9]\d{7}$/.test(digits)) return digits
  if (/^05[0-9]\d{7}$/.test(digits)) return '+972' + digits.slice(1)
  if (/^9725[0-9]\d{7}$/.test(digits)) return '+' + digits
  return null
}

/** SMS text sent to a guest when their event gallery is ready. */
export const galleryReadySms = (guestName: string, galleryUrl: string) =>
  `היי ${guestName}! 📸\nהגלריה מהאירוע מוכנה.\nצפה בתמונות שלך כאן:\n${galleryUrl}`
