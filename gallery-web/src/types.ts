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
  coverImageUrl: string | null
  coverCrop: { zoom: number; x: number; y: number } | null
  galleryDescription: string
  eventDate: string
  eventLocation: string
  eventType: string
  clientSelectionEnabled: boolean
  clientCode: string
  layoutMode: '1-col' | '2-col' | '3-col'
  imageSpacing: 'none' | 'small' | 'medium'
  cornerStyle: 'sharp' | 'rounded'
  generateStories: boolean
  showStories: boolean
  faceIndexEnabled?: boolean
  facePrivacyMode?: 'open' | 'private'
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
  // Face search (AWS Rekognition per-gallery collection)
  face_index_enabled?: boolean
  face_index_status?: 'pending' | 'indexing' | 'done' | 'failed' | null
  face_indexed_count?: number
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

// ─── Event Lead Capture ─────────────────────────────────────────────────────

export interface EventConfig {
  id: string
  business_id: string
  gallery_id: string | null
  name: string
  gallery_url: string
  welcome_text: string | null
  logo_url: string | null
  is_active: boolean
  created_at: string
}

export interface EventLead {
  id: string
  event_id: string
  name: string
  phone: string
  email: string | null
  whatsapp_status: 'pending' | 'sent' | 'failed'
  whatsapp_message_id: string | null
  whatsapp_error: string | null
  retry_count: number
  created_at: string
}

// ─── Questionnaires ─────────────────────────────────────────────────────────

export interface QuestionnaireQuestion {
  id: string
  label: string
  required: boolean
}

export interface QuestionnaireConfig {
  id: string
  business_id: string
  gallery_id: string | null
  title: string
  description: string | null
  questions: QuestionnaireQuestion[]
  background_url: string | null
  bg_animation: string | null
  send_method: 'none' | 'email' | 'sms'
  is_active: boolean
  created_at: string
}

export interface QuestionnaireResponse {
  id: string
  questionnaire_id: string
  respondent_name: string
  respondent_phone: string | null
  respondent_email: string | null
  answers: Record<string, string>
  created_at: string
}
