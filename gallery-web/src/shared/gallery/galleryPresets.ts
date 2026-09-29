// Reusable delivery/appearance bundles. A preset never carries gallery identity
// (title, client, passwords, cover, URLs); the server re-filters to the same keys.
// DB reads/writes live in shared/data/presets.ts.

/** Must match the server allowlist in _sanitize_preset_settings. */
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

/** Keep only preset-allowed keys so a preset is clean before it leaves the client. */
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
