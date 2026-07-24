// tender/collections.ts — direct-under-RLS data layer for tender collections
// (migration 100). Contract C6 explicitly allows browser writes here: the two
// tables carry simple owner-owned data and their RLS policies verify business
// ownership AND that referenced galleries/images belong to the same business.

import { supabase } from '../../supabase'
import { hasCollectionItem } from './metadata'

export interface TenderCollection {
  id: string
  business_id: string
  name: string
  brief: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TenderCollectionItem {
  id: string
  collection_id: string
  gallery_id: string
  image_id: string | null
  added_at: string
}

export async function listCollections(): Promise<{ data: TenderCollection[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tender_collections')
    .select('id, business_id, name, brief, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as TenderCollection[], error: null }
}

export async function createCollection(
  businessId: string,
  name: string,
  brief: Record<string, unknown> = {},
): Promise<{ data: TenderCollection | null; error: string | null }> {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) return { data: null, error: 'name_required' }
  const { data, error } = await supabase
    .from('tender_collections')
    .insert({ business_id: businessId, name: trimmed, brief })
    .select('id, business_id, name, brief, created_at, updated_at')
    .maybeSingle()
  if (error || !data) return { data: null, error: error?.message ?? 'create_failed' }
  return { data: data as TenderCollection, error: null }
}

export async function renameCollection(id: string, name: string): Promise<string | null> {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) return 'name_required'
  const { error } = await supabase.from('tender_collections').update({ name: trimmed }).eq('id', id)
  return error ? error.message : null
}

export async function listItems(collectionId: string): Promise<{ data: TenderCollectionItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tender_collection_items')
    .select('id, collection_id, gallery_id, image_id, added_at')
    .eq('collection_id', collectionId)
    .order('added_at', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as TenderCollectionItem[], error: null }
}

/** Add one item; no-ops when the pair is already present (client-side dedupe;
 *  the partial unique indexes in migration 100 back this up server-side). */
export async function addItem(
  existing: TenderCollectionItem[],
  collectionId: string,
  galleryId: string,
  imageId: string | null,
): Promise<{ data: TenderCollectionItem | null; error: string | null }> {
  if (hasCollectionItem(existing, galleryId, imageId)) return { data: null, error: null }
  const { data, error } = await supabase
    .from('tender_collection_items')
    .insert({ collection_id: collectionId, gallery_id: galleryId, image_id: imageId })
    .select('id, collection_id, gallery_id, image_id, added_at')
    .maybeSingle()
  if (error) {
    // duplicate under the unique index = already there → treat as success
    if (String(error.message).toLowerCase().includes('duplicate')) return { data: null, error: null }
    return { data: null, error: error.message }
  }
  return { data: (data ?? null) as TenderCollectionItem | null, error: null }
}

export async function removeItem(itemId: string): Promise<string | null> {
  const { error } = await supabase.from('tender_collection_items').delete().eq('id', itemId)
  return error ? error.message : null
}

// ─── Plain-text export ("copy list", no PDF tonight) ────────────────────────

export interface ExportGroup {
  galleryName: string
  clientName: string | null
  wholeGallery: boolean
  filenames: string[]
}

/** Pure formatter — unit-testable. One block per gallery, filenames indented. */
export function formatCollectionExport(collectionName: string, groups: ExportGroup[]): string {
  const lines: string[] = [collectionName, '='.repeat(Math.min(collectionName.length, 40))]
  for (const g of groups) {
    lines.push('')
    lines.push(g.clientName ? `${g.galleryName} (${g.clientName})` : g.galleryName)
    if (g.wholeGallery) lines.push('  * whole gallery')
    for (const f of g.filenames) lines.push(`  - ${f}`)
  }
  return lines.join('\n')
}

/** Resolve filenames for the image-level items, then format. */
export async function buildCopyList(
  collectionName: string,
  items: TenderCollectionItem[],
  galleryNames: Map<string, { name: string; clientName: string | null }>,
): Promise<string> {
  const imageIds = items.map(i => i.image_id).filter((x): x is string => !!x)
  const filenameById = new Map<string, string>()
  if (imageIds.length > 0) {
    const { data } = await supabase.from('images').select('id, filename').in('id', imageIds)
    for (const row of (data ?? []) as { id: string; filename: string | null }[]) {
      filenameById.set(row.id, row.filename ?? row.id)
    }
  }
  const byGallery = new Map<string, ExportGroup>()
  for (const it of items) {
    const meta = galleryNames.get(it.gallery_id)
    let grp = byGallery.get(it.gallery_id)
    if (!grp) {
      grp = {
        galleryName: meta?.name ?? it.gallery_id,
        clientName: meta?.clientName ?? null,
        wholeGallery: false,
        filenames: [],
      }
      byGallery.set(it.gallery_id, grp)
    }
    if (it.image_id === null) grp.wholeGallery = true
    else grp.filenames.push(filenameById.get(it.image_id) ?? it.image_id)
  }
  return formatCollectionExport(collectionName, [...byGallery.values()])
}
