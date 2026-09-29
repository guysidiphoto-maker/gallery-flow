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
