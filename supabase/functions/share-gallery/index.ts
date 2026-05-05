// Send an email with a gallery's public link to a recipient. Owner-only.
//
// POST { galleryId, recipientEmail, subject?, message? }
//   → 200 { ok: true,  messageId }
//   → 400 / 401 / 500 { ok: false, error }
//
// Resend handles delivery; gallery_email_log captures every attempt
// (status='sent' on success, 'failed' otherwise) for the Activities tab.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const PUBLIC_VIEWER_BASE = Deno.env.get('PUBLIC_VIEWER_BASE') ?? 'https://pixflow-ai.com'
const FROM_ADDRESS = 'Pixflow <noreply@pixflow-ai.com>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function requirePhotographer(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('missing_auth')
  const jwt = authHeader.replace('Bearer ', '')
  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(jwt)
  if (error || !user) throw new Error('unauthorized')
  return { user, sb }
}

async function loadOwnedGallery(sb: SupabaseClient, userId: string, galleryId: string) {
  const { data: biz } = await sb
    .from('businesses')
    .select('id, business_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (!biz) throw new Error('no_business_for_user')

  const { data: gallery } = await sb
    .from('galleries')
    .select('id, business_id, name, status, password_hash')
    .eq('id', galleryId)
    .eq('business_id', biz.id)
    .maybeSingle()
  if (!gallery) throw new Error('gallery_not_found')
  return { gallery, business: biz }
}

// Minimal email-shape validation. We don't need full RFC 5321 — just enough
// to refuse pasting "asdf" into the recipient field.
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface EmailComposition {
  subject: string
  html: string
}

function composeEmail(opts: {
  galleryName: string
  galleryUrl: string
  studioName: string
  customSubject?: string
  customMessage?: string
}): EmailComposition {
  const subject = (opts.customSubject?.trim()) || `התמונות שלך מ${opts.galleryName} מוכנות 📸`
  const safeMessage = opts.customMessage
    ? escapeHtml(opts.customMessage).replace(/\n/g, '<br>')
    : ''
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f1f1f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#11111c;border:1px solid #1e1e2a;border-radius:18px;padding:36px 32px;">
        <tr><td style="text-align:right;">
          <div style="font-size:13px;font-weight:600;color:#a5b4fc;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">
            ${escapeHtml(opts.studioName || 'Pixflow')}
          </div>
          <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 16px;color:#f1f1f4;line-height:1.25;">
            ${escapeHtml(opts.galleryName)}
          </h1>
          ${safeMessage ? `<p style="font-size:15px;line-height:1.6;color:#c5c8d8;margin:0 0 24px;">${safeMessage}</p>` : ''}
          <p style="font-size:14px;line-height:1.6;color:#8b8fa3;margin:0 0 28px;">
            הגלריה מוכנה לצפייה. לחיצה על הכפתור תפתח אותה בדפדפן שלך.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${opts.galleryUrl}"
               style="display:inline-block;padding:14px 32px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:.01em;">
              צפו בגלריה
            </a>
          </div>
          <p style="font-size:12px;line-height:1.6;color:#5c5f73;margin:24px 0 0;text-align:center;word-break:break-all;">
            ${escapeHtml(opts.galleryUrl)}
          </p>
        </td></tr>
      </table>
      <p style="font-size:11px;color:#5c5f73;margin:20px 0 0;">
        נשלח דרך Pixflow · pixflow-ai.com
      </p>
    </td></tr>
  </table>
</body>
</html>`
  return { subject, html }
}

async function sendViaResend(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'resend_not_configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = (data as { message?: string })?.message ?? `resend_status_${res.status}`
      return { ok: false, error: String(err).slice(0, 240) }
    }
    const id = (data as { id?: string })?.id
    if (!id) return { ok: false, error: 'resend_missing_id' }
    return { ok: true, messageId: id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg.slice(0, 240) }
  }
}

// Per-business rate limit. A compromised photographer JWT can otherwise
// drive Resend sends to attacker-chosen addresses without bound — and
// Resend will eventually rate-limit our whole account, blast-radius'ing
// every customer. 20/hour is well above legitimate photographer use
// (sharing a single client gallery a few times a day) but well below the
// volumes a spammer would want.
const RATE_LIMIT_PER_HOUR = 20

async function isOverRateLimit(
  sb: SupabaseClient,
  businessId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: galleryIds } = await sb
    .from('galleries')
    .select('id')
    .eq('business_id', businessId)
  const ids = (galleryIds ?? []).map((g: { id: string }) => g.id)
  if (ids.length === 0) return false
  const { count } = await sb
    .from('gallery_email_log')
    .select('id', { count: 'exact', head: true })
    .in('gallery_id', ids)
    .gte('created_at', oneHourAgo)
  return (count ?? 0) >= RATE_LIMIT_PER_HOUR
}

async function logEmail(
  sb: SupabaseClient,
  galleryId: string,
  recipient: string,
  subject: string,
  result: { ok: true; messageId: string } | { ok: false; error: string },
): Promise<void> {
  await sb.from('gallery_email_log').insert({
    gallery_id: galleryId,
    recipient_email: recipient,
    subject,
    status: result.ok ? 'sent' : 'failed',
    provider_id: result.ok ? result.messageId : null,
    error_message: result.ok ? null : result.error,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  let user, sb
  try {
    const auth = await requirePhotographer(req)
    user = auth.user
    sb = auth.sb
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unauthorized'
    return json({ ok: false, error: msg }, 401)
  }

  let body: {
    galleryId?: string
    recipientEmail?: string
    subject?: string
    message?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const galleryId = String(body.galleryId ?? '').trim()
  const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase()
  if (!galleryId)                  return json({ ok: false, error: 'galleryId_required' }, 400)
  if (!looksLikeEmail(recipientEmail)) return json({ ok: false, error: 'invalid_email' }, 400)

  let owned
  try {
    owned = await loadOwnedGallery(sb, user.id, galleryId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'lookup_failed'
    const status = msg === 'gallery_not_found' || msg === 'no_business_for_user' ? 404 : 500
    return json({ ok: false, error: msg }, status)
  }
  const { gallery, business } = owned

  if (gallery.status !== 'live') {
    return json({ ok: false, error: 'gallery_not_published' }, 409)
  }

  if (await isOverRateLimit(sb, business.id)) {
    return json(
      { ok: false, error: 'rate_limit_exceeded', limit_per_hour: RATE_LIMIT_PER_HOUR },
      429,
    )
  }

  const galleryUrl = `${PUBLIC_VIEWER_BASE}/gallery/${gallery.id}`
  const { subject, html } = composeEmail({
    galleryName:   gallery.name || 'הגלריה שלך',
    galleryUrl,
    studioName:    business.business_name || 'Pixflow',
    customSubject: body.subject,
    customMessage: body.message,
  })

  const result = await sendViaResend({ to: recipientEmail, subject, html })
  await logEmail(sb, gallery.id, recipientEmail, subject, result)

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502)
  }
  return json({ ok: true, messageId: result.messageId })
})
