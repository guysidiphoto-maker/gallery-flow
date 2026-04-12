export interface DeliverySettings {
  accessType: 'public' | 'password'
  password: string | null
  downloadsEnabled: boolean
  bulkDownloadEnabled: boolean
  downloadQuality: 'web' | 'high' | 'original'
  studioName: string
  studioWebsite?: string
  logoUrl: string | null
  showFooterCredit: boolean
  galleryTitle: string
  clientName: string
  coverImageId: string | null
  layoutMode: '1-col' | '2-col' | '3-col'
  imageSpacing: 'none' | 'small' | 'medium'
  cornerStyle: 'sharp' | 'rounded'
  generateStories: boolean
  showStories: boolean
  // Backward compat fields from old settings
  allowDownloads?: boolean
  autoGenerateStories?: boolean
}

export interface Gallery {
  id: string
  name: string
  client_name: string | null
  status: string
  image_count: number
  delivery_settings: DeliverySettings
  published_at: string | null
  demo_expires_at?: string | null
}

export interface GalleryImage {
  id: string
  filename: string
  storage_path: string
  original_path?: string | null
  thumbnail_path: string | null
  is_top_pick: boolean
  sort_order: number
  section_id?: string | null
}

export interface Story {
  id: string
  style: string
  storage_path: string
}

export interface GallerySection {
  id: string
  name: string
  sort_order: number
}
