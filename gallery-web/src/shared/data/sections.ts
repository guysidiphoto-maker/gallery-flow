// Rows of the `gallery_sections` table (the tabs/chapters inside a gallery).

import { supabase } from '@/shared/lib/supabase'

/** A gallery's sections in display order. */
export async function listGallerySections(galleryId: string) {
  return supabase
    .from('gallery_sections')
    .select('id, name, slug, sort_order, description')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
}
