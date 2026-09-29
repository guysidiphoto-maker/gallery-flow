import { supabase } from '@/shared/lib/supabase'

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
  const results = await Promise.allSettled(ids.map((id, idx) =>
    supabase.from(table).update({ sort_order: idx * 1000 }).eq('id', id)
  ))
  return results
    .map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)) ? ids[i] : null)
    .filter((x): x is string => x !== null)
}
