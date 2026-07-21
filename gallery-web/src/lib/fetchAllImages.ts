import { supabase } from '../supabase'

// PostgREST returns at most ~1000 rows per request unless an explicit range is
// given. Unbounded `.from('images').select()` calls therefore SILENTLY cap at
// 1000, which made a 1,165-image gallery show/operate on only 1,000 rows in the
// dashboard (grid, counts, and storage purge). This helper pages past that cap.
export const IMAGES_PAGE = 1000

export interface Page<T> { data: T[] | null; error: unknown }

/**
 * Generic "fetch every page" loop. Pure and injectable so the boundary
 * behavior (exactly 1000, 1001, etc.) is unit-testable without a live DB.
 * Stops when a page returns fewer than pageSize rows.
 */
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

/**
 * Fetch ALL image rows for a gallery, across every page. A unique tiebreaker
 * (id) is added to the sort so page boundaries can't skip or duplicate rows
 * when many images share a sort_order.
 */
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
