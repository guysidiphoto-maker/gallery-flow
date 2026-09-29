// Vendors (florists, venues …) the photographer tagged on photos; they open a
// code link to download their tagged images.

import { supabase } from '@/shared/lib/supabase'

/** The vendor behind an access code (RPC; row or one-row array, empty when invalid). */
export async function getVendorByCode(code: string) {
  return supabase.rpc('get_vendor_by_code', { p_code: code })
}

/** `{ image_id, gallery_id }` for every photo tagged with this vendor. */
export async function listVendorImageTags(vendorId: string) {
  return supabase
    .from('image_vendor_tags')
    .select('image_id, gallery_id')
    .eq('vendor_id', vendorId)
}
