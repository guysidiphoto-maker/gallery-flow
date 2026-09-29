// Wrapper for the share-gallery edge function (Resend send + gallery_email_log).
// Forwards the studio's brand kit so the email looks like the studio's, with the
// plain-text template as fallback.

import { supabase } from '@/shared/lib/supabase'
import { getOwnerBusiness } from '@/shared/data/businesses'
import { invokeShareGallery } from '@/shared/data/shareEmail'

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
  // Optional; loaded from the businesses row when omitted. Callers that already
  // hold the kit pass it to skip a round-trip.
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
  const { data, error } = await getOwnerBusiness(user.id, 'brand_kit, logo_url, business_name, website_url')
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

// Callers that already hold the kit pass it (even null) to skip the lookup.
async function studioBrandFor(input: { studioBrand?: BrandKit | null }): Promise<BrandKit | null> {
  return input.studioBrand !== undefined ? input.studioBrand : loadStudioBrandKit()
}

export async function sendGalleryShareEmail(
  input: ShareGalleryEmailInput,
): Promise<ShareGalleryEmailResult> {
  // Resolve brand kit up-front so a stale auth session fails here (in the
  // photographer's browser) rather than inside the edge function.
  const studioBrand = await studioBrandFor(input)
  const { data, error } = await invokeShareGallery({
    galleryId:      input.galleryId,
    recipientEmail: input.recipientEmail,
    subject:        input.subject,
    message:        input.message,
    studioBrand:    studioBrand ?? null,
  })
  if (error) {
    return { ok: false, error: error.message ?? 'invoke_failed' }
  }
  const res = (data ?? {}) as ShareGalleryEmailResult
  return res.ok
    ? { ok: true, messageId: res.messageId }
    : { ok: false, error: res.error ?? 'unknown_error' }
}

// Render the email without sending (share modal preview); the server uses the
// same composer for preview and send, so they can't drift.
export async function previewGalleryShareEmail(
  input: Omit<ShareGalleryEmailInput, 'recipientEmail'> & { recipientEmail?: string },
): Promise<ShareGalleryPreviewResult> {
  const studioBrand = await studioBrandFor(input)
  const { data, error } = await invokeShareGallery({
    galleryId:      input.galleryId,
    recipientEmail: input.recipientEmail ?? '',
    subject:        input.subject,
    message:        input.message,
    studioBrand:    studioBrand ?? null,
    preview:        true,
  })
  if (error) {
    return { ok: false, error: error.message ?? 'invoke_failed' }
  }
  const res = (data ?? {}) as ShareGalleryPreviewResult
  return res.ok
    ? { ok: true, subject: res.subject, html: res.html, text: res.text, branded: res.branded }
    : { ok: false, error: res.error ?? 'unknown_error' }
}
