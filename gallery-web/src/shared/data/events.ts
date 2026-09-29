// Event lead-capture pages (`events` table) behind a QR code at `/event/{id}`.

import { supabase } from '@/shared/lib/supabase'

/** The active event with this id, or null. */
export async function getActiveEvent(eventId: string) {
  return supabase
    .from('events')
    .select('id, business_id, gallery_id, name, gallery_url, welcome_text, logo_url, is_active, created_at')
    .eq('id', eventId)
    .eq('is_active', true)
    .maybeSingle()
}
