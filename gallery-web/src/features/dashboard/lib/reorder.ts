import { fetchAllGalleryImages, updateImage } from '@/shared/data/images'
import { listGallerySections, updateSection } from '@/shared/data/sections'

/** Copy of `list` with `fromId` moved to `toId`'s index, or null if either is missing. */
export function moveItem<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] | null {
  const fromIdx = list.findIndex(x => x.id === fromId)
  const toIdx = list.findIndex(x => x.id === toId)
  if (fromIdx === -1 || toIdx === -1) return null
  const next = list.slice()
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

// Persists `idx * 1000` sort orders (the gap keeps later moves collision-free).
// allSettled so one failed UPDATE is reported instead of silently mis-ordering
// the rest. Returns the ids whose write failed.
export async function persistSortOrder(table: 'images' | 'gallery_sections', ids: string[]): Promise<string[]> {
  const update = table === 'images' ? updateImage : updateSection
  const results = await Promise.allSettled(ids.map((id, idx) => update(id, { sort_order: idx * 1000 })))
  return results
    .map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)) ? ids[i] : null)
    .filter((x): x is string => x !== null)
}

/**
 * Copy of `list` with each row's sort_order taken from the server's `rows`
 * (rows the server did not return keep theirs), sorted by the result.
 */
export function applyServerSortOrder<T extends { id: string; sort_order?: number | null }>(
  list: T[],
  rows: { id: string; sort_order: number | null }[],
): T[] {
  const byId = new Map(rows.map(r => [r.id, r.sort_order]))
  return list
    .map(x => byId.has(x.id) ? { ...x, sort_order: byId.get(x.id) } : x)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

// After a partly failed reorder the server holds a mix of old and new orders;
// read back what it actually has. Null when that read fails too.
export async function fetchServerSortOrder(
  table: 'images' | 'gallery_sections',
  galleryId: string,
): Promise<{ id: string; sort_order: number | null }[] | null> {
  type Row = { id: string; sort_order: number | null }
  if (table === 'images') {
    return fetchAllGalleryImages<Row>(galleryId, 'id, sort_order').catch(() => null)
  }
  const { data, error } = await listGallerySections(galleryId, 'id, sort_order')
  return error ? null : (data as Row[] | null) ?? []
}
