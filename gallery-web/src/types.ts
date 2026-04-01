export interface Gallery {
  id: string
  name: string
  client_name: string | null
  status: string
  image_count: number
  delivery_settings: Record<string, unknown>
  published_at: string | null
}

export interface GalleryImage {
  id: string
  filename: string
  storage_path: string
  original_path?: string | null
  thumbnail_path: string | null
  is_top_pick: boolean
  sort_order: number
}

export interface Story {
  id: string
  style: string
  storage_path: string
}
