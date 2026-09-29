// businesses.brand_kit JSONB: types, defaults, DB helpers and the gallery-defaults projection.
// Every field is optional because owners who never opened /brand-kit still have `{}`.

import { supabase } from '@/shared/lib/supabase'
import type { DeliverySettings } from '@/shared/types'

export const BRAND_KIT_BUCKET = 'business-brand'

export type BrandKitLogoSlot = 'url' | 'dark_url' | 'square_url'

export type BrandKitWatermarkPosition =
  | 'tl' | 'tc' | 'tr'
  | 'cl' | 'cc' | 'cr'
  | 'bl' | 'bc' | 'br'

export type BrandKitWatermarkSource = 'logo' | 'studio_name' | 'custom_text'

export type BrandKitLanguage = 'he' | 'en' | 'auto'

export interface BrandKit {
  schema_version?: number
  logo?: {
    url?: string | null
    dark_url?: string | null
    square_url?: string | null
  }
  colors?: {
    primary?: string
    secondary?: string
    accent?: string
    ink?: string
    paper?: string
  }
  typography?: {
    heading_family?: string
    body_family?: string
  }
  voice?: {
    tagline?: string
    signature?: string
    language?: BrandKitLanguage
  }
  watermark?: {
    enabled?: boolean
    source?: BrandKitWatermarkSource
    text?: string
    position?: BrandKitWatermarkPosition
    opacity_percent?: number
    scale_percent?: number
    contrast_aware?: boolean
  }
  social?: {
    instagram?: string
    facebook?: string
    tiktok?: string
    twitter?: string
    website?: string
  }
  // Opt-in: when true, new galleries inherit defaults via applyBrandKitToGalleryDefaults.
  apply_to_galleries?: boolean
}

// Full skeleton so every controlled input in the editor has a starting value.
export function defaultBrandKit(): BrandKit {
  return {
    schema_version: 1,
    logo: { url: null, dark_url: null, square_url: null },
    colors: {
      primary: '#141413',
      secondary: '#767470',
      accent: '#A67C52',
      ink: '#141413',
      paper: '#F2EFE9',
    },
    typography: {
      heading_family: 'Playfair Display, Georgia, serif',
      body_family: 'Inter, -apple-system, sans-serif',
    },
    voice: {
      tagline: '',
      signature: '',
      language: 'he',
    },
    watermark: {
      enabled: false,
      source: 'logo',
      text: '',
      position: 'br',
      opacity_percent: 18,
      scale_percent: 12,
      contrast_aware: true,
    },
    social: {
      instagram: '',
      facebook: '',
      tiktok: '',
      twitter: '',
      website: '',
    },
    apply_to_galleries: false,
  }
}

// Curated font pairs; field names mirror brand_kit.typography so a pick saves as-is.
export interface FontPair {
  id: string
  label: string
  heading_family: string
  body_family: string
  sample_heading: string
  sample_body: string
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: 'inter-inter',
    label: 'Inter • Inter',
    heading_family: 'Inter, -apple-system, sans-serif',
    body_family: 'Inter, -apple-system, sans-serif',
    sample_heading: 'Studio Name',
    sample_body: 'Clean, modern, neutral. Works for every category.',
  },
  {
    id: 'playfair-inter',
    label: 'Playfair Display • Inter',
    heading_family: 'Playfair Display, Georgia, serif',
    body_family: 'Inter, -apple-system, sans-serif',
    sample_heading: 'Studio Name',
    sample_body: 'Editorial heading paired with a calm sans body.',
  },
  {
    id: 'cormorant-source',
    label: 'Cormorant • Source Sans',
    heading_family: 'Cormorant Garamond, Georgia, serif',
    body_family: 'Source Sans 3, Source Sans Pro, Inter, sans-serif',
    sample_heading: 'Studio Name',
    sample_body: 'Refined high-contrast serif with a humanist sans.',
  },
  {
    id: 'heebo-heebo',
    label: 'Heebo • Heebo',
    heading_family: 'Heebo, Inter, sans-serif',
    body_family: 'Heebo, Inter, sans-serif',
    sample_heading: 'שם הסטודיו',
    sample_body: 'זיווג עברי-ראשון, נקי וברור לכל סוגי תוכן.',
  },
  {
    id: 'garamond-lato',
    label: 'EB Garamond • Lato',
    heading_family: 'EB Garamond, Georgia, serif',
    body_family: 'Lato, Inter, sans-serif',
    sample_heading: 'Studio Name',
    sample_body: 'Classic literary pairing for warm, timeless studios.',
  },
]

/** Brand kit merged over defaults; null when the row isn't visible (RLS: owner only). */
export async function getBrandKit(businessId: string): Promise<BrandKit | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select('brand_kit')
    .eq('id', businessId)
    .maybeSingle()

  if (error) {
    console.error('[brandKit] getBrandKit failed', error)
    return null
  }
  if (!data) return null
  const stored = (data.brand_kit ?? {}) as BrandKit
  return mergeBrandKit(defaultBrandKit(), stored)
}

// Direct UPDATE is safe: RLS restricts it to the owning user.
export async function saveBrandKit(
  businessId: string,
  brand: BrandKit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const next: BrandKit = { ...brand, schema_version: 1 }
  const { error } = await supabase
    .from('businesses')
    .update({ brand_kit: next })
    .eq('id', businessId)
  if (error) {
    console.error('[brandKit] saveBrandKit failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// The shape is two levels deep, so a per-section shallow spread is a full merge.
function mergeBrandKit(base: BrandKit, override: BrandKit): BrandKit {
  return {
    schema_version: override.schema_version ?? base.schema_version,
    logo: { ...base.logo, ...override.logo },
    colors: { ...base.colors, ...override.colors },
    typography: { ...base.typography, ...override.typography },
    voice: { ...base.voice, ...override.voice },
    watermark: { ...base.watermark, ...override.watermark },
    social: { ...base.social, ...override.social },
    apply_to_galleries: override.apply_to_galleries ?? base.apply_to_galleries,
  }
}

/**
 * Gallery-creation defaults (studioName, logoUrl, welcomeMessage) when the owner opted in.
 * Colors/typography/watermark are read live by the viewer, so they are not copied here.
 */
export function applyBrandKitToGalleryDefaults(
  brand: BrandKit | null | undefined,
): Partial<DeliverySettings> {
  if (!brand || !brand.apply_to_galleries) return {}

  const out: Partial<DeliverySettings> = {}

  const signatureFirstLine = (brand.voice?.signature ?? '').split('\n')[0]?.trim()
  if (signatureFirstLine) out.studioName = signatureFirstLine

  if (brand.logo?.url) out.logoUrl = brand.logo.url

  if (brand.voice?.tagline) out.welcomeMessage = brand.voice.tagline

  return out
}

// Storage RLS requires the first path segment to be the business id.
export function logoStoragePath(businessId: string, slot: BrandKitLogoSlot, ext = 'png'): string {
  const slotName = slot === 'url' ? 'primary' : slot === 'dark_url' ? 'dark' : 'square'
  return `${businessId}/logo-${slotName}.${ext}`
}
