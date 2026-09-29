// Gallery activity: guest download log rows and the owner's per-gallery summary.

import { supabase } from '@/shared/lib/supabase'

export interface DownloadLogRow {
  gallery_id: string
  image_id: string | null
  resolution: string
  download_kind: 'single' | 'batch'
  guest_email: string | null
  guest_name: string | null
}

/** Appends one or more rows to `gallery_download_log` (insert-only policy, guests allowed). */
export async function insertDownloadLog(rows: DownloadLogRow | DownloadLogRow[]) {
  return supabase.from('gallery_download_log').insert(rows)
}

/** Downloads / favourites / emails for one gallery (`gallery_activity_summary`, owner-checked). */
export async function getGalleryActivitySummary(galleryId: string) {
  return supabase.rpc('gallery_activity_summary', { p_gallery_id: galleryId })
}
