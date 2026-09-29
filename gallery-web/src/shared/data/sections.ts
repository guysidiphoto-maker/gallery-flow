// Rows of the `gallery_sections` table (the tabs/chapters inside a gallery).
// Writes are RLS-scoped to the signed-in owner's galleries.

import { supabase } from '@/shared/lib/supabase'

/** A gallery's sections in display order. */
export async function listGallerySections<Columns extends string = 'id, name, slug, sort_order, description'>(
  galleryId: string,
  columns: Columns = 'id, name, slug, sort_order, description' as Columns,
) {
  return supabase
    .from('gallery_sections')
    .select(columns)
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
}

/** Inserts a section and returns it with `columns`. */
export async function insertSection<Columns extends string>(row: Record<string, unknown>, columns: Columns) {
  return supabase.from('gallery_sections').insert(row).select(columns).single()
}

export async function updateSection(sectionId: string, patch: Record<string, unknown>) {
  return supabase.from('gallery_sections').update(patch).eq('id', sectionId)
}

export async function deleteSection(sectionId: string) {
  return supabase.from('gallery_sections').delete().eq('id', sectionId)
}
