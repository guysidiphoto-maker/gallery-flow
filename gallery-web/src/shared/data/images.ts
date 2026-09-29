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

// ── Owner writes (RLS: only rows in the signed-in owner's galleries match) ──

export async function updateImage(imageId: string, patch: Record<string, unknown>) {
  return supabase.from('images').update(patch).eq('id', imageId)
}

/** Applies `patch` to the given images; pass `galleryId` to also scope the update to that gallery. */
export async function updateImages(imageIds: string[], patch: Record<string, unknown>, galleryId?: string) {
  const query = supabase.from('images').update(patch).in('id', imageIds)
  return galleryId ? query.eq('gallery_id', galleryId) : query
}

/** Moves every image of the gallery that has no section into `sectionId`. */
export async function assignUnsectionedImages(galleryId: string, sectionId: string) {
  return supabase.from('images')
    .update({ section_id: sectionId })
    .eq('gallery_id', galleryId)
    .is('section_id', null)
}

export async function deleteImage(imageId: string) {
  return supabase.from('images').delete().eq('id', imageId)
}

export async function deleteImages(imageIds: string[]) {
  return supabase.from('images').delete().in('id', imageIds)
}

/** Every image of a gallery in one unpaged select, in display order (ZIP export). */
export async function listImagesForExport(galleryId: string) {
  return supabase
    .from('images')
    .select('id, filename, web_preview_path, original_path, original_uploaded, thumbnail_path, is_top_pick, sort_order, section_id')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
}

/** `[{ gallery_id, thumbnail_path, web_preview_path }]`: the first photo of each gallery, in one RPC. */
export async function listGalleryCoverThumbs(galleryIds: string[]) {
  return supabase.rpc('gallery_cover_thumbs', { p_gallery_ids: galleryIds })
}

export interface RecordImageUploadArgs {
  p_gallery_id: string
  p_filename: string
  p_web_preview_path: string
  p_thumbnail_path: string
  p_original_path: string
  p_original_size: number
  p_section_id: string | null
  p_sort_order: number
  p_public_thumb_present: boolean
}

/** Inserts the images row for an uploaded object and consumes one token server-side; data is the new id. */
export async function recordImageUpload(args: RecordImageUploadArgs) {
  return supabase.rpc('record_image_upload', args)
}

export interface ReplaceImageArgs {
  p_gallery_id: string
  p_image_id: string
  p_web_preview_path: string
  p_thumbnail_path: string
  p_original_path: string
  p_filename: string
  p_original_size: number
  p_mime_type: string | null
  p_width: number | null
  p_height: number | null
}

/** Points an image row at new objects in one transaction (`replace_image`); data has `ok` and the old paths. */
export async function replaceImage(args: ReplaceImageArgs) {
  return supabase.rpc('replace_image', args)
}
