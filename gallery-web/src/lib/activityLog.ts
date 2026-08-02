// Best-effort activity logging from the public viewer. Failures are
// swallowed — the photographer's analytics tab is a nice-to-have, not a
// blocker on a guest's download or favorite action.

import { supabase } from '../supabase'

export type DownloadResolution = 'original' | 'web' | 'thumbnail'
export type DownloadKind = 'single' | 'batch'

/** Optional downloader identity, captured by the email gate when the gallery
 *  has trackDownloads on. Both fields are nullable — galleries without tracking
 *  keep logging anonymously. */
export interface Downloader {
  email?: string | null
  name?: string | null
}

export async function logDownload(
  galleryId: string,
  imageId: string | null,
  resolution: DownloadResolution,
  kind: DownloadKind,
  downloader?: Downloader | null,
): Promise<void> {
  try {
    await supabase.from('gallery_download_log').insert({
      gallery_id: galleryId,
      image_id: imageId,
      resolution,
      download_kind: kind,
      guest_email: downloader?.email ?? null,
      guest_name: downloader?.name ?? null,
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
  downloader?: Downloader | null,
): Promise<void> {
  if (imageIds.length === 0) return
  try {
    const rows = imageIds.map(id => ({
      gallery_id: galleryId,
      image_id: id,
      resolution,
      download_kind: 'batch' as const,
      guest_email: downloader?.email ?? null,
      guest_name: downloader?.name ?? null,
    }))
    await supabase.from('gallery_download_log').insert(rows)
  } catch (e) {
    console.warn('[activity] batch download log failed', e)
  }
}
