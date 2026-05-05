// Best-effort activity logging from the public viewer. Failures are
// swallowed — the photographer's analytics tab is a nice-to-have, not a
// blocker on a guest's download or favorite action.

import { supabase } from '../supabase'

export type DownloadResolution = 'original' | 'web' | 'thumbnail'
export type DownloadKind = 'single' | 'batch'

export async function logDownload(
  galleryId: string,
  imageId: string | null,
  resolution: DownloadResolution,
  kind: DownloadKind,
): Promise<void> {
  try {
    await supabase.from('gallery_download_log').insert({
      gallery_id: galleryId,
      image_id: imageId,
      resolution,
      download_kind: kind,
    })
  } catch (e) {
    // never fatal
    console.warn('[activity] download log failed', e)
  }
}

export async function logBatchDownload(
  galleryId: string,
  imageIds: string[],
  resolution: DownloadResolution,
): Promise<void> {
  if (imageIds.length === 0) return
  try {
    const rows = imageIds.map(id => ({
      gallery_id: galleryId,
      image_id: id,
      resolution,
      download_kind: 'batch' as const,
    }))
    await supabase.from('gallery_download_log').insert(rows)
  } catch (e) {
    console.warn('[activity] batch download log failed', e)
  }
}

export async function toggleFavorite(
  galleryId: string,
  imageId: string,
  next: boolean,
  guestName?: string,
): Promise<void> {
  try {
    if (next) {
      await supabase.from('gallery_favorites').insert({
        gallery_id: galleryId,
        image_id: imageId,
        guest_name: guestName ?? null,
      })
    } else {
      // Without explicit guest_name scoping, .delete() would match every
      // anonymous favorite for this image — i.e. one guest unfavoriting
      // would wipe out everyone else's heart. Pin the filter explicitly
      // to either the named guest or the null/anonymous bucket.
      const q = supabase
        .from('gallery_favorites')
        .delete()
        .eq('gallery_id', galleryId)
        .eq('image_id', imageId)
      await (guestName ? q.eq('guest_name', guestName) : q.is('guest_name', null))
    }
  } catch (e) {
    console.warn('[activity] favorite toggle failed', e)
  }
}
