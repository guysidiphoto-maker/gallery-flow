import type { PortfolioSettings } from '../portfolioSettings'

export type EditorSection = 'brand' | 'design' | 'content' | 'contact'

export interface EditorGallery {
  id: string
  name: string
  client_name: string | null
  image_count: number
  delivery_settings: Record<string, unknown> | null
}

// Swatches and backgrounds are user-facing choices (data), not UI tokens.
export const ACCENT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#d946ef', '#84cc16', '#ffffff', '#64748b',
]

export const BG_STYLES: { key: PortfolioSettings['bgStyle']; label: string; bg: string }[] = [
  { key: 'dark', label: 'כהה', bg: '#050508' },
  { key: 'midnight', label: 'חצות', bg: '#080818' },
  { key: 'gradient', label: 'סגול', bg: 'linear-gradient(135deg, #050510, #150a20)' },
  { key: 'deep-blue', label: 'כחול עמוק', bg: 'linear-gradient(135deg, #050510, #0a1628)' },
]

export const FONT_STYLES: { key: PortfolioSettings['fontStyle']; label: string; sample: string; family: string }[] = [
  { key: 'modern', label: 'מודרני', sample: 'Aa', family: '-apple-system, sans-serif' },
  { key: 'elegant', label: 'אלגנטי', sample: 'Aa', family: 'Georgia, serif' },
  { key: 'bold', label: 'בולט', sample: 'Aa', family: 'Impact, sans-serif' },
  { key: 'heebo', label: 'חיבו', sample: 'אב', family: "'Heebo', sans-serif" },
  { key: 'rubik', label: 'רוביק', sample: 'אב', family: "'Rubik', sans-serif" },
  { key: 'assistant', label: 'אסיסטנט', sample: 'אב', family: "'Assistant', sans-serif" },
]

export const HERO_STYLES: { key: PortfolioSettings['heroStyle']; label: string }[] = [
  { key: 'blur', label: 'תמונה מטושטשת' },
  { key: 'cover', label: 'תמונת כיסוי' },
  { key: 'gradient-only', label: 'גרדיאנט בלבד' },
]
