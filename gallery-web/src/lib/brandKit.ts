// Central Brand Kit helpers — read the businesses.brand_kit JSONB (created in
// migration 072_business_brand_kit.sql) and project it onto downstream
// surfaces.
//
// The JSONB shape is intentionally permissive at the type level (every field
// optional) because:
//   1. A photographer who hasn't visited /brand-kit yet has the column at the
//      default `{}` — we still want every reader to compile.
//   2. The schema_version field gates future migrations of the shape without
//      a coordinated DB change.

import { supabase } from '../supabase'
import type { DeliverySettings } from '../types'

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
  // Photographer-controlled flag: when true, applyBrandKitToGalleryDefaults
  // emits brand colors/typography/voice into a new gallery's delivery_settings
  // at create time. Defaults to false — the photographer opts in.
  apply_to_galleries?: boolean
}

// Default skeleton — used by the editor for first-time setup so every section
// has a stable starting value (matters for controlled inputs).
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

// Curated font pairs surfaced in the editor. Each entry is one "card" the
// photographer picks. The pair shape mirrors the brand_kit.typography object
// so saving is a single Object.assign — no per-pair mapping.
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

// ── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Read the brand_kit JSONB for a specific business.
 *
 * RLS gates this to the owning user, so we don't pass user_id explicitly —
 * the existing `businesses_owner_select` policy from migration 006 already
 * restricts the row to its owner. Returns null when the business row isn't
 * visible to the caller (wrong user, deleted business, etc.).
 */
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
  // The column is NOT NULL DEFAULT '{}', so the worst case is an empty object.
  // Merge over the default skeleton so callers always get every field.
  const stored = (data.brand_kit ?? {}) as BrandKit
  return mergeBrandKit(defaultBrandKit(), stored)
}

/**
 * Persist a Brand Kit document to the businesses row. RLS gates the UPDATE
 * to the owning user (businesses_owner_update from migration 006), so we
 * don't need an RPC — a direct UPDATE is safe.
 */
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

// Deep-ish merge: each top-level section is merged shallowly. The Brand Kit
// shape is intentionally two levels deep, so per-section spread is enough.
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

// ── Projection: Brand Kit → DeliverySettings defaults ───────────────────────
//
// Apply-to-galleries is opt-in: the photographer toggles
// `brand_kit.apply_to_galleries` in the Brand Kit editor, and the gallery
// editor's "Create gallery" flow merges the result of this function over the
// existing default delivery_settings shape. The merge is one-way (brand →
// gallery) at create time only — editing brand colors later does NOT
// retroactively rewrite live galleries.

/**
 * Project the Brand Kit onto the subset of DeliverySettings fields a gallery
 * editor can sensibly inherit from studio identity. Returns a partial so the
 * caller can spread it over its own defaults.
 *
 * Currently maps:
 *   - studioName       ← derived from voice.signature first line (when set)
 *   - logoUrl          ← logo.url
 *   - welcomeMessage   ← voice.tagline (single short headline)
 *
 * Intentionally does NOT map watermark / colors / typography into the
 * gallery's delivery_settings — those are pulled live at viewer render time
 * by the gallery viewer reading the photographer's brand_kit directly. That
 * keeps brand updates instantly visible across every gallery.
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

/**
 * Build the public Storage path for a logo asset. Centralized so the editor
 * and the future renderers agree on the layout that the RLS policy expects
 * (path[0] must be the business UUID — see migration 072).
 */
export function logoStoragePath(businessId: string, slot: BrandKitLogoSlot, ext = 'png'): string {
  const slotName = slot === 'url' ? 'primary' : slot === 'dark_url' ? 'dark' : 'square'
  return `${businessId}/logo-${slotName}.${ext}`
}
