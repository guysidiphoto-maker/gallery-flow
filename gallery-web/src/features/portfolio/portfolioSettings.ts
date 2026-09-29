// Portfolio settings utilities — extracted from PortfolioEditor.tsx so
// callers can read settings without paying the cost of the (large) editor
// component bundle. The editor itself stays in PortfolioEditor.tsx and is
// lazy-loaded; this file keeps zero React/UI imports so it can be in the
// initial bundle for ~free.

export interface PortfolioSettings {
  // Branding
  logoBase64: string
  pageTitle: string
  tagline: string
  // Contact
  phone: string
  email: string
  instagram: string
  website: string
  // Appearance
  accentColor: string
  bgStyle: 'dark' | 'midnight' | 'gradient' | 'deep-blue'
  fontStyle: 'modern' | 'elegant' | 'bold' | 'heebo' | 'rubik' | 'assistant'
  heroStyle: 'blur' | 'gradient-only' | 'cover'
  heroCoverGalleryId: string
  // Layout
  gridColumns: 2 | 3
  showPhotoCounts: boolean
  showStudioBadge: boolean
  // Visibility
  hiddenGalleryIds: string[]
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  logoBase64: '',
  pageTitle: '',
  tagline: '',
  phone: '',
  email: '',
  instagram: '',
  website: '',
  accentColor: '#6366f1',
  bgStyle: 'dark',
  fontStyle: 'modern',
  heroStyle: 'blur',
  heroCoverGalleryId: '',
  gridColumns: 2,
  showPhotoCounts: true,
  showStudioBadge: true,
  hiddenGalleryIds: [],
}

export function loadPortfolioSettings(clientId: string): PortfolioSettings {
  try {
    const raw = localStorage.getItem(`portfolio-settings-${clientId}`)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function savePortfolioSettings(clientId: string, settings: PortfolioSettings) {
  localStorage.setItem(`portfolio-settings-${clientId}`, JSON.stringify(settings))
}

const FONT_FAMILIES: Record<PortfolioSettings['fontStyle'], string> = {
  modern: '-apple-system, sans-serif',
  elegant: 'Georgia, serif',
  bold: 'Impact, sans-serif',
  heebo: "'Heebo', sans-serif",
  rubik: "'Rubik', sans-serif",
  assistant: "'Assistant', sans-serif",
}

export function getFontFamily(fontStyle: PortfolioSettings['fontStyle']): string {
  return FONT_FAMILIES[fontStyle] || 'inherit'
}
