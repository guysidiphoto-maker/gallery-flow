// Rows of the `images` table (one per photo). Owner reads are RLS-scoped to the
// owner's galleries; guests read images through the RPCs in publicGallery.ts.

import { supabase } from '@/shared/lib/supabase'

// PostgREST silently caps unranged selects at ~1000 rows; page past it so large
// galleries aren't truncated.
export const IMAGES_PAGE = 1000

export interface Page<T> { data: T[] | null; error: unknown }

/** Injectable page loop so page-boundary behavior is testable without a DB. */
export async function paginateAll<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize = IMAGES_PAGE,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

/** Every image of a gallery in display order (throws on error). The `id` tiebreaker keeps page boundaries stable. */
export async function fetchAllGalleryImages<T = Record<string, unknown>>(
  galleryId: string,
  columns: string,
): Promise<T[]> {
  return paginateAll<T>(async (from, to) => {
    const r = await supabase
      .from('images')
      .select(columns)
      .eq('gallery_id', galleryId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
    return { data: r.data as T[] | null, error: r.error }
  })
}

/** `{ id, width, height }` for every image of a gallery. */
export async function listImageDimensions(galleryId: string) {
  return supabase
    .from('images')
    .select('id, width, height')
    .eq('gallery_id', galleryId)
}

/** The gallery's first image by sort order (or null), with the given `columns`. */
export async function getFirstImage<Columns extends string>(galleryId: string, columns: Columns) {
  return supabase
    .from('images')
    .select(columns)
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
}

/** Up to 200 images flagged `is_top_pick` across the given galleries. */
export async function listTopPicks(galleryIds: string[]) {
  return supabase
    .from('images')
    .select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path')
    .in('gallery_id', galleryIds)
    .eq('is_top_pick', true)
    .order('sort_order', { ascending: true })
    .limit(200)
}

/** Specific images by id, in display order (`storage_path` is aliased from `web_preview_path`). */
export async function listImagesByIds(imageIds: string[]) {
  return supabase
    .from('images')
    .select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path')
    .in('id', imageIds)
    .order('sort_order', { ascending: true })
}
