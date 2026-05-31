// Send an email with a gallery's public link to a recipient. Owner-only.
//
// POST { galleryId, recipientEmail, subject?, message?, studioBrand?, preview? }
//   → 200 { ok: true,  messageId }                           (send)
//   → 200 { ok: true,  preview: true, subject, html, text }  (preview only)
//   → 400 / 401 / 500 { ok: false, error }
//
// Resend handles delivery; gallery_email_log captures every attempt
// (status='sent' on success, 'failed' otherwise) for the Activities tab.
//
// Branded template: when the photographer's businesses.brand_kit JSONB is
// populated (migration 062) we render the studio's logo/colors/voice. When
// it's not, we fall back to the legacy plain-text template so the existing
// flow never regresses.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  BrandKit,
  composeShareEmail,
} from './template.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const PUBLIC_VIEWER_BASE = Deno.env.get('PUBLIC_VIEWER_BASE') ?? 'https://pixflow-ai.com'
// `From` stays on the verified Pixflow domain so Resend will accept the
// send. Reply-To carries the photographer's address so client replies go
// to the studio, not to a no-reply inbox.
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

interface LoadedOwnership {
  gallery: {
    id: string
    business_id: string
    name: string
    status: string
    password_hash: string | null
    delivery_settings: Record<string, unknown> | null
  }
  business: {
    id: string
    business_name: string
    brand_kit: BrandKit | null
    logo_url: string | null
    website_url: string | null
  }
}

async function loadOwnedGallery(
  sb: SupabaseClient,
  userId: string,
  galleryId: string,
): Promise<LoadedOwnership> {
  const { data: biz } = await sb
    .from('businesses')
    .select('id, business_name, brand_kit, logo_url, website_url')
    .eq('user_id', userId)
    .maybeSingle()
  if (!biz) throw new Error('no_business_for_user')

  const { data: gallery } = await sb
    .from('galleries')
    .select('id, business_id, name, status, password_hash, delivery_settings')
    .eq('id', galleryId)
    .eq('business_id', biz.id)
    .maybeSingle()
  if (!gallery) throw new Error('gallery_not_found')
  return { gallery: gallery as LoadedOwnership['gallery'], business: biz as LoadedOwnership['business'] }
}

// Minimal email-shape validation. We don't need full RFC 5321 — just enough
// to refuse pasting "asdf" into the recipient field.
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// Merge the kit pulled off the businesses row with anything the caller
// passed in the request payload. Caller wins per-field so the dashboard's
// preview-then-send flow renders exactly what the photographer saw. Falls
// back to the legacy logo_url / website_url columns so accounts that never
// filled in the JSONB still get a partially-branded email.
function resolveBrandKit(
  business: LoadedOwnership['business'],
  override: BrandKit | null | undefined,
): BrandKit | null {
  const stored: BrandKit | null = business.brand_kit ?? null
  const legacy: BrandKit | null = (business.logo_url || business.website_url)
    ? {
      logo:   business.logo_url   ? { url: business.logo_url } : null,
      social: business.website_url ? { website: business.website_url } : null,
    }
    : null
  const base: BrandKit | null = stored ?? legacy
  if (!override) return base
  return {
    logo:   override.logo   ?? base?.logo   ?? null,
    colors: override.colors ?? base?.colors ?? null,
    voice:  override.voice  ?? base?.voice  ?? null,
    social: override.social ?? base?.social ?? null,
  }
}

// Pull the cover image off delivery_settings (set by the gallery editor) or
// fall back to the first image's web preview. Used as the hero thumbnail in
// the branded email body. Returns null if no images exist.
async function resolveCoverUrl(
  sb: SupabaseClient,
  gallery: LoadedOwnership['gallery'],
): Promise<string | null> {
  const settings = gallery.delivery_settings ?? {}
  const explicit = (settings as { coverImageUrl?: string }).coverImageUrl
  if (explicit) return explicit
  const { data: img } = await sb
    .from('images')
    .select('thumbnail_path, web_preview_path')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!img) return null
  const path = (img as { thumbnail_path?: string; web_preview_path?: string }).thumbnail_path
            || (img as { thumbnail_path?: string; web_preview_path?: string }).web_preview_path
  if (!path) return null
  return `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path}`
}

// Look up the studio owner's email so client replies land in the
// photographer's inbox. Service role can read auth.users; we only pull the
// email column. Returns null on missing/invalid so the caller can decide
// whether to omit the Reply-To header entirely (Resend allows that).
async function lookupOwnerEmail(sb: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await sb.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

async function sendViaResend(opts: {
  to: string
  subject: string
  html: string
  text: string
  replyTo: string | null
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'resend_not_configured' }
  }
  try {
    const payload: Record<string, unknown> = {
      from: FROM_ADDRESS,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }
    if (opts.replyTo) payload.reply_to = opts.replyTo
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    galleryId?:    string
    recipientEmail?: string
    subject?:      string
    message?:      string
    studioBrand?:  BrandKit | null
    // When true, render the email and return the HTML/text without
    // contacting Resend or writing the log row. Used by the dashboard's
    // preview-before-send button.
    preview?:      boolean
  }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const galleryId = String(body.galleryId ?? '').trim()
  const isPreview = body.preview === true
  const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase()
  if (!galleryId) return json({ ok: false, error: 'galleryId_required' }, 400)
  // Recipient is optional for preview mode (the preview doesn't get sent).
  if (!isPreview && !looksLikeEmail(recipientEmail)) {
    return json({ ok: false, error: 'invalid_email' }, 400)
  }

  let owned: LoadedOwnership
  try {
    owned = await loadOwnedGallery(sb, user.id, galleryId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'lookup_failed'
    const status = msg === 'gallery_not_found' || msg === 'no_business_for_user' ? 404 : 500
    return json({ ok: false, error: msg }, status)
  }
  const { gallery, business } = owned

  if (!isPreview && gallery.status !== 'live') {
    return json({ ok: false, error: 'gallery_not_published' }, 409)
  }

  if (!isPreview && await isOverRateLimit(sb, business.id)) {
    return json(
      { ok: false, error: 'rate_limit_exceeded', limit_per_hour: RATE_LIMIT_PER_HOUR },
      429,
    )
  }

  const galleryUrl = `${PUBLIC_VIEWER_BASE}/gallery/${gallery.id}`
  const studioBrand = resolveBrandKit(business, body.studioBrand)
  const coverImageUrl = await resolveCoverUrl(sb, gallery)
  const composed = composeShareEmail({
    galleryName:    gallery.name || 'הגלריה שלך',
    galleryUrl,
    coverImageUrl,
    studioName:     business.business_name || 'Pixflow',
    studioBrand,
    customSubject:  body.subject,
    customMessage:  body.message,
  })

  if (isPreview) {
    return json({
      ok:      true,
      preview: true,
      subject: composed.subject,
      html:    composed.html,
      text:    composed.text,
      branded: composed.branded,
    })
  }

  const replyTo = await lookupOwnerEmail(sb, user.id)
  const result = await sendViaResend({
    to: recipientEmail,
    subject: composed.subject,
    html: composed.html,
    text: composed.text,
    replyTo,
  })
  await logEmail(sb, gallery.id, recipientEmail, composed.subject, result)

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502)
  }
  return json({ ok: true, messageId: result.messageId })
})
