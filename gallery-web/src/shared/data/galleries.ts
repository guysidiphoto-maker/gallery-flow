// Rows of the `galleries` table. These are plain table reads, so RLS decides what
// comes back (an owner only ever sees their own galleries).

import { supabase } from '@/shared/lib/supabase'

/** The live-or-draft gallery with this slug in a business (errors when not exactly one). */
export async function getGalleryBySlug(businessId: string, slug: string) {
  return supabase.from('galleries').select('*')
    .eq('business_id', businessId).eq('slug', slug)
    .in('status', ['live', 'draft']).single()
}

/** Legacy slug fallback: first live-or-draft gallery whose name matches the slug with dashes as wildcards. */
export async function findGalleryByNameSlug(businessId: string, slug: string) {
  return supabase.from('galleries').select('*')
    .eq('business_id', businessId).in('status', ['live', 'draft'])
    .ilike('name', slug.replace(/-/g, '%')).limit(1)
}

/** A client's live galleries, newest published first. */
export async function listLiveGalleriesForClient(clientId: string) {
  return supabase
    .from('galleries')
    .select('id, name, client_name, image_count, published_at, delivery_settings')
    .eq('client_id', clientId).eq('status', 'live')
    .order('published_at', { ascending: false })
}

/** `{ id, name, published_at }` for the given gallery ids. */
export async function listGalleryNames(galleryIds: string[]) {
  return supabase
    .from('galleries')
    .select('id, name, published_at')
    .in('id', galleryIds)
}

// ── Owner reads/writes (RLS: only the signed-in owner's galleries match) ──

/** A business's galleries with `columns`, newest first. */
export async function listBusinessGalleries<Columns extends string>(businessId: string, columns: Columns) {
  return supabase
    .from('galleries')
    .select(columns)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
}

/** One gallery by id; errors when it doesn't exist. */
export async function getGallery<Columns extends string>(galleryId: string, columns: Columns) {
  return supabase.from('galleries').select(columns).eq('id', galleryId).single()
}

/** One gallery by id, or null. */
export async function findGallery<Columns extends string>(galleryId: string, columns: Columns) {
  return supabase.from('galleries').select(columns).eq('id', galleryId).maybeSingle()
}

/** Inserts a gallery; data is `{ id }`. */
export async function insertGallery(row: Record<string, unknown>) {
  return supabase.from('galleries').insert(row).select('id').single()
}

/** Inserts a gallery; data is `{ id, slug }` or null. */
export async function insertGalleryWithSlug(row: Record<string, unknown>) {
  return supabase.from('galleries').insert(row).select('id, slug').maybeSingle()
}

/**
 * Updates plain granted columns (name, status, published_at, image_count, face_index_enabled).
 * delivery_settings can only be written through `updateGallerySettings`.
 */
export async function updateGallery(galleryId: string, patch: Record<string, unknown>) {
  return supabase.from('galleries').update(patch).eq('id', galleryId)
}

/** Deletes a gallery; sections and images cascade via FK (storage objects do not). */
export async function deleteGallery(galleryId: string) {
  return supabase.from('galleries').delete().eq('id', galleryId)
}

/** Validated, owner-checked delivery_settings patch; data is `{ ok, errors? }`. */
export async function updateGallerySettings(galleryId: string, patch: Record<string, unknown>) {
  return supabase.rpc('update_gallery_settings', { p_gallery_id: galleryId, p_patch: patch })
}

/** Clones settings + sections (not photos) into a new draft; data is the new gallery id. */
export async function duplicateGallery(sourceGalleryId: string, newName: string) {
  return supabase.rpc('duplicate_gallery', { p_source_gallery_id: sourceGalleryId, p_new_name: newName })
}

/** The gallery's client code (owner-only table; a trigger moves it out of delivery_settings). */
export async function getGalleryClientCode(galleryId: string): Promise<string> {
  const { data } = await supabase
    .from('gallery_client_codes').select('code').eq('gallery_id', galleryId).maybeSingle()
  return (data as { code?: string } | null)?.code ?? ''
}
