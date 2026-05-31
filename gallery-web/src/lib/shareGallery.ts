// Photographer-side wrapper for the share-gallery edge function. Sends an
// email via Resend on the server, logs to gallery_email_log either way.
//
// Pulls the studio's brand_kit (logo, primary color, voice, signature, socials)
// off the businesses row and forwards it to the edge so the rendered email
// looks like it came from the studio — not from Pixflow. Falls back to the
// legacy plain-text template when the brand kit is unset.

import { supabase } from '../supabase'

// ── Brand kit shape ──────────────────────────────────────────────────────────
// Mirrors the JSONB documented in migration 062. Every leaf is optional so a
// half-filled kit (e.g. logo + colors but no voice) still renders gracefully.
export interface BrandKit {
  logo?:   { url?: string | null } | null
  colors?: { primary?: string | null; ink?: string | null } | null
  voice?:  {
    tagline?:   string | null
    signature?: string | null
    language?:  'he' | 'en' | null
  } | null
  social?: {
    instagram?: string | null
    website?:   string | null
    email?:     string | null
  } | null
}

export interface ShareGalleryEmailInput {
  galleryId: string
  recipientEmail: string
  subject?: string
  message?: string
  // Optional override. When omitted the wrapper loads the kit off the
  // photographer's businesses row. Callers that already hold the kit (e.g.
  // the Dashboard share modal, which fetches it for the preview iframe)
  // pass it through to avoid a duplicate round-trip.
  studioBrand?: BrandKit | null
}

export interface ShareGalleryEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

export interface ShareGalleryPreviewResult {
  ok: boolean
  subject?: string
  html?: string
  text?: string
  branded?: boolean
  error?: string
}

// Light-weight loader used by both the send path and the preview button.
// Returns null when no row matches (RLS / not signed in) or no kit is stored;
// the edge function falls back to the legacy plain template in that case.
export async function loadStudioBrandKit(): Promise<BrandKit | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('businesses')
    .select('brand_kit, logo_url, business_name, website_url')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return null
  const stored = (data as { brand_kit?: BrandKit | null }).brand_kit ?? null
  // If the column is empty but the row has the legacy `logo_url` / website,
  // synthesise a minimal kit so the email at least shows the studio logo.
  if (stored) return stored
  const logoUrl = (data as { logo_url?: string | null }).logo_url
  const websiteUrl = (data as { website_url?: string | null }).website_url
  if (!logoUrl && !websiteUrl) return null
  return {
    logo:   logoUrl   ? { url: logoUrl } : null,
    social: websiteUrl ? { website: websiteUrl } : null,
  }
}

export async function sendGalleryShareEmail(
  input: ShareGalleryEmailInput,
): Promise<ShareGalleryEmailResult> {
  // Resolve brand kit up-front so a stale auth session fails here (in the
  // photographer's browser) rather than inside the edge function.
  const studioBrand = input.studioBrand !== undefined
    ? input.studioBrand
    : await loadStudioBrandKit()

  const { data, error } = await supabase.functions.invoke('share-gallery', {
    body: {
      galleryId:      input.galleryId,
      recipientEmail: input.recipientEmail,
      subject:        input.subject,
      message:        input.message,
      studioBrand:    studioBrand ?? null,
    },
  })
  if (error) {
    return { ok: false, error: error.message ?? 'invoke_failed' }
  }
  const res = (data ?? {}) as ShareGalleryEmailResult
  return res.ok
    ? { ok: true, messageId: res.messageId }
    : { ok: false, error: res.error ?? 'unknown_error' }
}

// Render the email without sending. Used by the Dashboard share modal's
// "תצוגה מקדימה" button so the photographer sees exactly what the client
// will get before clicking send. Same composer runs on the server in both
// preview and send paths — no risk of drift.
export async function previewGalleryShareEmail(
  input: Omit<ShareGalleryEmailInput, 'recipientEmail'> & { recipientEmail?: string },
): Promise<ShareGalleryPreviewResult> {
  const studioBrand = input.studioBrand !== undefined
    ? input.studioBrand
    : await loadStudioBrandKit()

  const { data, error } = await supabase.functions.invoke('share-gallery', {
    body: {
      galleryId:      input.galleryId,
      recipientEmail: input.recipientEmail ?? '',
      subject:        input.subject,
      message:        input.message,
      studioBrand:    studioBrand ?? null,
      preview:        true,
    },
  })
  if (error) {
    return { ok: false, error: error.message ?? 'invoke_failed' }
  }
  const res = (data ?? {}) as ShareGalleryPreviewResult
  return res.ok
    ? { ok: true, subject: res.subject, html: res.html, text: res.text, branded: res.branded }
    : { ok: false, error: res.error ?? 'unknown_error' }
}
