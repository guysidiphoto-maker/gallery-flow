// The `share-gallery` edge function: sends (or previews) the branded gallery email
// through Resend and logs it in gallery_email_log.

import { supabase } from '@/shared/lib/supabase'

export interface ShareGalleryBody {
  galleryId: string
  recipientEmail: string
  subject?: string
  message?: string
  studioBrand: unknown
  preview?: boolean
}

/** data is `{ ok, messageId? | subject?, html?, text?, branded?, error? }`. */
export async function invokeShareGallery(body: ShareGalleryBody) {
  return supabase.functions.invoke('share-gallery', { body })
}
