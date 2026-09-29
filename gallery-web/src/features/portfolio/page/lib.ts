import { storageUrl } from '@/shared/lib/supabase'

export interface GalleryRow {
  id: string
  name: string
  client_name: string | null
  image_count: number
  published_at: string | null
  delivery_settings: Record<string, unknown> | null
}

export interface ImageRow {
  id: string
  gallery_id: string
  filename: string
  storage_path: string
  thumbnail_path: string | null
}

export interface EventType {
  key: string
  label: string
  gals: GalleryRow[]
  cover: string
}

export type PortfolioView = 'home' | 'type' | 'gallery'

export const EVENT_LABELS: Record<string, string> = {
  'conference': 'Conferences', 'corporate-event': 'Corporate', 'government': 'Government',
  'retreat-abroad': 'Retreats Abroad', 'retreat-local': 'Local Retreats',
  'pre-event': 'Pre-Events', 'other': 'Events',
}

export function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

export function imgUrl(path: string | null) {
  return path ? storageUrl('gallery-images', path) : ''
}

/** Viewport height, with a server-side fallback. */
export function viewportHeight() {
  return typeof window !== 'undefined' ? window.innerHeight : 900
}
