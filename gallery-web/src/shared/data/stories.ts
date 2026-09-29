// Rows of the `stories` table (short MP4 story videos of a gallery). Owner reads
// and writes are RLS-scoped to the signed-in owner's galleries.

import { supabase } from '@/shared/lib/supabase'

/** A gallery's stories, oldest first. */
export async function listGalleryStories<Columns extends string>(galleryId: string, columns: Columns) {
  return supabase
    .from('stories')
    .select(columns)
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: true })
}

/** Inserts a story row and returns it with `columns`. */
export async function insertStory<Columns extends string>(row: Record<string, unknown>, columns: Columns) {
  return supabase.from('stories').insert(row).select(columns).single()
}

export async function deleteStory(storyId: string) {
  return supabase.from('stories').delete().eq('id', storyId)
}
