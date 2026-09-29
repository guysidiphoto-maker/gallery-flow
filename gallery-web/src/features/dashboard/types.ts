import type { useToast } from '@/shared/ui/Toast'
import type { useConfirm } from '@/shared/ui/useConfirm'

// Mirrors the postgres enum gallery_status.
export type GalleryStatus = 'draft' | 'live' | 'archived'

export interface Gallery {
  id: string
  name: string
  slug?: string | null
  image_count: number
  published_at: string | null
  status: GalleryStatus
  delivery_settings?: Record<string, unknown>
  download_count?: number
  favorite_count?: number
  // Canonical column for the rekognition RPC; delivery_settings.faceIndexEnabled
  // mirrors it for the public viewer.
  face_index_enabled?: boolean | null
  // Canonical event columns; the editor falls back to them when
  // delivery_settings has no value (galleries created before the JSONB keys).
  event_date?: string | null
  event_location?: string | null
}

export interface GalleryImage {
  id: string
  filename: string
  storage_path: string
  thumbnail_path: string | null
  // HD source object; selected so deletes can purge every storage object.
  original_path?: string | null
  is_top_pick: boolean
  sort_order: number
  section_id?: string | null
}

export interface GallerySection {
  id: string
  name: string
  sort_order: number
  description?: string | null
}

export interface Story {
  id: string
  style: string | null
  storage_path: string
  duration: number | null
  created_at?: string
}

export interface ActivitySummary {
  downloads_total: number
  favorites_total: number
  emails_total: number
  recent_downloads: Array<{ id: string; image_id: string | null; resolution: string; download_kind: string; guest_email?: string | null; guest_name?: string | null; created_at: string }>
  downloaders?: Array<{ guest_email: string; guest_name: string | null; downloads: number; last_at: string }>
  recent_favorites: Array<{ id: string; image_id: string; guest_name: string | null; note: string | null; created_at: string }>
  recent_emails: Array<{ id: string; recipient_email: string; subject: string | null; status: string; created_at: string }>
}

export type DashboardView = 'overview' | 'galleries' | 'clients' | 'search' | 'import' | 'brand-kit'

export type EditorTab = 'photos' | 'settings' | 'activities' | 'welcome' | 'stories'

export type DesignSubTab = 'cover' | 'type' | 'color' | 'grid'

export type CustomDomainStatus = 'unverified' | 'pending_dns' | 'verified' | 'error'

export type Toast = ReturnType<typeof useToast>['showToast']
export type Confirm = ReturnType<typeof useConfirm>['confirm']

export const GALLERY_COLUMNS =
  'id, name, slug, image_count, published_at, status, download_count, favorite_count, delivery_settings, event_date, event_location'

export const IMAGE_COLUMNS_WITH_ORIGINAL =
  'id, filename, storage_path:web_preview_path, thumbnail_path, original_path, is_top_pick, sort_order, section_id'

export const IMAGE_COLUMNS =
  'id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick, sort_order, section_id'

export const STORY_COLUMNS = 'id, style, storage_path, duration, created_at'

export const SECTION_COLUMNS = 'id, name, sort_order, description'
