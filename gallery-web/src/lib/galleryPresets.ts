// Gallery presets — owner-scoped reusable delivery + appearance bundles.
//
// A preset NEVER carries gallery identity: no title, client assignment, event
// metadata, passwords/codes, cover image, published status or URLs. The
// PRESET_ALLOWED_KEYS list below is the single client-side source of truth for
// what a preset may contain; the server re-filters to the same set in the
// migration 111 trigger (_sanitize_preset_settings), so the two must stay in
// sync. Applying a preset routes through update_gallery_settings, which
// validates every key against the same allowlist/constraints as a normal edit.

import { supabase } from '../supabase'

/** The reusable, non-identity delivery_settings keys a preset may capture.
 *  MUST match the allowlist in supabase/migrations/111_gallery_presets.sql. */
export const PRESET_ALLOWED_KEYS = [
  // Downloads
  'downloadsEnabled', 'bulkDownloadEnabled', 'trackDownloads', 'downloadQuality',
  // Access mode default (NOT the password / codes)
  'accessType', 'facePrivacyMode', 'clientSelectionEnabled',
  // Watermark
  'watermarkEnabled', 'watermarkText', 'watermarkPosition', 'watermarkSource',
  'watermarkScalePercent', 'watermarkOpacityPercent', 'watermarkContrastAware',
  // Grid / layout
  'gridSpacing', 'layoutMode', 'imageSpacing', 'cornerStyle', 'thumbnailSize', 'feedLayout',
  // Appearance / branding policy (NOT logoUrl — a per-gallery asset)
  'appearance', 'themeColor', 'headingFont', 'bodyFont', 'showFooterCredit',
  // Welcome / viewer
  'welcomeStyle', 'generateStories', 'showStories',
] as const

export type PresetSettings = Record<string, unknown>

export interface GalleryPreset {
  id: string
  business_id: string
  name: string
  settings: PresetSettings
  is_default: boolean
  created_at: string
  updated_at: string
}

/** Reduce a gallery's delivery_settings to only the reusable preset keys.
 *  Identity/secret keys are dropped — the same defensive filter the server
 *  applies, so a preset saved from the UI is clean before it ever leaves. */
export function capturePresetSettings(deliverySettings: Record<string, unknown> | null | undefined): PresetSettings {
  const src = deliverySettings ?? {}
  const out: PresetSettings = {}
  for (const key of PRESET_ALLOWED_KEYS) {
    if (key in src && src[key] !== undefined) out[key] = src[key]
  }
  return out
}

/** A short human summary of what a preset will change, for the confirm step. */
export function summarizePreset(p: GalleryPreset): string[] {
  const s = p.settings ?? {}
  const parts: string[] = []
  if ('downloadsEnabled' in s) parts.push(s.downloadsEnabled ? 'הורדות פעילות' : 'הורדות כבויות')
  if ('accessType' in s) parts.push(`גישה: ${s.accessType}`)
  if ('watermarkEnabled' in s) parts.push(s.watermarkEnabled ? 'סימן מים' : 'ללא סימן מים')
  if ('gridSpacing' in s) parts.push(`רשת: ${s.gridSpacing}`)
  if ('appearance' in s) parts.push(`מראה: ${s.appearance}`)
  if ('themeColor' in s) parts.push(`צבע: ${s.themeColor}`)
  const total = Object.keys(s).length
  if (parts.length < total) parts.push(`+${total - parts.length} הגדרות`)
  return parts
}

export async function listPresets(businessId: string): Promise<GalleryPreset[]> {
  const { data, error } = await supabase
    .from('gallery_presets')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (error) { console.warn('[presets] list failed', error); return [] }
  return (data ?? []) as GalleryPreset[]
}

export async function savePreset(
  businessId: string, name: string, deliverySettings: Record<string, unknown> | null | undefined,
): Promise<GalleryPreset | null> {
  const settings = capturePresetSettings(deliverySettings)
  const { data, error } = await supabase
    .from('gallery_presets')
    .insert({ business_id: businessId, name: name.trim(), settings })
    .select('*')
    .single()
  if (error) { console.warn('[presets] save failed', error); return null }
  return data as GalleryPreset
}

export async function renamePreset(id: string, name: string): Promise<boolean> {
  const { error } = await supabase
    .from('gallery_presets')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) { console.warn('[presets] rename failed', error); return false }
  return true
}

export async function deletePreset(id: string): Promise<boolean> {
  const { error } = await supabase.from('gallery_presets').delete().eq('id', id)
  if (error) { console.warn('[presets] delete failed', error); return false }
  return true
}

export async function setDefaultPreset(id: string): Promise<boolean> {
  // The single-default invariant is enforced by the DB trigger; we only flag
  // this row and let the trigger clear the others.
  const { error } = await supabase
    .from('gallery_presets')
    .update({ is_default: true })
    .eq('id', id)
  if (error) { console.warn('[presets] set-default failed', error); return false }
  return true
}
