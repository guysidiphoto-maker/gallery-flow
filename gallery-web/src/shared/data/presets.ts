// Gallery presets (`gallery_presets` table): reusable delivery-settings bundles.
// RLS returns only the signed-in owner's presets; a trigger re-filters `settings`.

import { supabase } from '@/shared/lib/supabase'

/** A business's presets, newest first. */
export async function listGalleryPresets(businessId: string) {
  return supabase
    .from('gallery_presets')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
}

/** Inserts a preset and returns the full row. */
export async function insertGalleryPreset(row: { business_id: string; name: string; settings: Record<string, unknown> }) {
  return supabase.from('gallery_presets').insert(row).select('*').single()
}

/** Updates a preset. Setting `is_default: true` clears the previous default (DB trigger). */
export async function updateGalleryPreset(presetId: string, patch: { name?: string; is_default?: boolean }) {
  return supabase.from('gallery_presets').update(patch).eq('id', presetId)
}

export async function deleteGalleryPreset(presetId: string) {
  return supabase.from('gallery_presets').delete().eq('id', presetId)
}
