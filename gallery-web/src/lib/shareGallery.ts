// Photographer-side wrapper for the share-gallery edge function. Sends an
// email via Resend on the server, logs to gallery_email_log either way.
//
// The dashboard UI (recipient input + send button) lands in a follow-up PR.
// This module is the single seam every UI caller goes through.

import { supabase } from '../supabase'

export interface ShareGalleryEmailInput {
  galleryId: string
  recipientEmail: string
  subject?: string
  message?: string
}

export interface ShareGalleryEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendGalleryShareEmail(
  input: ShareGalleryEmailInput,
): Promise<ShareGalleryEmailResult> {
  const { data, error } = await supabase.functions.invoke('share-gallery', {
    body: {
      galleryId:      input.galleryId,
      recipientEmail: input.recipientEmail,
      subject:        input.subject,
      message:        input.message,
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
