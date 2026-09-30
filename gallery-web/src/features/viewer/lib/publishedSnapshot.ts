import { getPublishedSnapshot } from '@/shared/data/publicGallery'
import type { DeliverySettings, Gallery, GallerySection } from '@/shared/types'

// When on, clients see the last-published revision's settings + sections so
// unpublished edits never leak. Images stay live. Off by default (env rollback).
const USE_PUBLISHED_SNAPSHOT =
  (import.meta.env.VITE_USE_PUBLISHED_SNAPSHOT as string | undefined) === 'true'

interface PublishedSnapshot {
  revision_id: string
  revision_index: number
  settings: Record<string, unknown> | null
  section_data: Array<{
    id: string
    name: string
    slug?: string | null
    sort_order?: number | null
    description?: string | null
  }> | null
  name: string | null
  status: string | null
  access_type: string | null
  event_date: string | null
  event_type: string | null
  event_location: string | null
  created_at: string
}

/** Overlay the published snapshot on the live row; any failure keeps the live read. */
export async function applyPublishedSnapshot(
  id: string,
  publishedRevisionId: string | null,
  g: Gallery,
  sections: GallerySection[],
): Promise<{ gallery: Gallery; sections: GallerySection[] }> {
  let liveSections = sections
  let liveGallery = g
  if (!USE_PUBLISHED_SNAPSHOT || !publishedRevisionId) return { gallery: liveGallery, sections: liveSections }
  try {
    const { data: snapRows, error: snapErr } = await getPublishedSnapshot(id)
    if (snapErr) {
      console.warn('[snapshot] rpc_error — falling back to live read', snapErr.message)
    } else {
      const snap = Array.isArray(snapRows) ? (snapRows[0] as PublishedSnapshot | undefined) : (snapRows as PublishedSnapshot | undefined)
      if (snap) {
        const snapSettings = (snap.settings ?? {}) as Partial<DeliverySettings>
        const snapStatus = (snap.status === 'draft' || snap.status === 'live' || snap.status === 'archived')
          ? snap.status
          : g.status
        liveGallery = {
          ...g,
          name: snap.name ?? g.name,
          status: snapStatus,
          delivery_settings: snapSettings as DeliverySettings,
        }
        // Sections added after publish stay hidden until the next Publish.
        if (Array.isArray(snap.section_data)) {
          liveSections = snap.section_data
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map(s => ({
              id: s.id,
              name: s.name,
              slug: s.slug ?? null,
              sort_order: s.sort_order ?? 0,
            }))
        }
      } else {
        console.warn('[snapshot] no_row_for_published_revision_id — falling back to live read')
      }
    }
  } catch (e) {
    console.warn('[snapshot] threw — falling back to live read', e)
  }
  return { gallery: liveGallery, sections: liveSections }
}
