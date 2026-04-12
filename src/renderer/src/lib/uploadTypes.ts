// ─── Gallery Publish Status ──────────────────────────────────────────────────

export type PublishStatus =
  | 'draft'
  | 'preparing_assets'
  | 'uploading_previews'
  | 'preview_live'
  | 'uploading_originals'
  | 'fully_live'
  | 'partially_failed'
  | 'failed'

// ─── Per-Image Upload Status ────────────────────────────────────────────────

export type ImageUploadStatus =
  | 'pending'
  | 'generating_assets'
  | 'uploading_thumbnail'
  | 'uploading_preview'
  | 'preview_ready'
  | 'uploading_original'
  | 'original_ready'
  | 'original_failed'
  | 'failed'

// ─── Queue Item ─────────────────────────────────────────────────────────────

export type QueuePriority = 'high' | 'low'
export type QueueItemType = 'thumbnail' | 'web_preview' | 'original'
export type QueueItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused'
export type UploadMethod = 'standard' | 'tus'

export interface QueueItem {
  id: string
  galleryId: string
  filename: string
  localPath: string
  storagePath: string
  type: QueueItemType
  priority: QueuePriority
  status: QueueItemStatus
  sizeBytes: number
  uploadMethod?: UploadMethod
  error?: string
  startedAt?: number
  completedAt?: number
  elapsedMs?: number
}

// ─── Per-Image Tracking ─────────────────────────────────────────────────────

export interface ImageUploadRecord {
  filename: string
  localPath: string
  status: ImageUploadStatus
  thumbnailSizeBytes?: number
  webPreviewSizeBytes?: number
  originalSizeBytes?: number
  width?: number
  height?: number
  mimeType?: string
  thumbnailUploaded: boolean
  webPreviewUploaded: boolean
  originalUploaded: boolean
  originalUploadMethod?: UploadMethod
  originalFailedReason?: string
}

// ─── Queue State (persisted) ────────────────────────────────────────────────

export interface PersistedQueueState {
  galleryId: string
  galleryName: string
  localGalleryId: string
  publishStatus: PublishStatus
  items: QueueItem[]
  images: ImageUploadRecord[]
  createdAt: number
  updatedAt: number
}

// ─── Publish Store State ────────────────────────────────────────────────────

export interface PublishProgress {
  phase: PublishStatus
  totalImages: number
  thumbsUploaded: number
  previewsUploaded: number
  originalsUploaded: number
  originalsFailed: number
  originalsQueued: number
  failedImages: Array<{ filename: string; reason: string }>
  currentFile?: string
  percent: number
}

// ─── Compression Result (from main process) ─────────────────────────────────

export interface CompressionResult {
  web: ArrayBuffer
  thumb: ArrayBuffer
  originalSize: number
  webSize: number
  thumbSize: number
  width: number
  height: number
}

// ─── Upload Concurrency Config ──────────────────────────────────────────────

export interface QueueConfig {
  previewConcurrency: number
  originalConcurrency: number
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  previewConcurrency: 6,
  originalConcurrency: 3,
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STANDARD_UPLOAD_LIMIT = 19 * 1024 * 1024
export const SAFE_UPLOAD_LIMIT = 5 * 1024 * 1024
export const ORIGINAL_TUS_THRESHOLD = 5 * 1024 * 1024  // 5MB — always TUS for originals above this
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024
export const BUCKET = 'gallery-images'
export const STORY_BUCKET = 'gallery-stories'
export const MAX_RETRIES = 2
export const GALLERY_BASE = 'https://pixflow-ai.com'
export const PREVIEW_FAILURE_THRESHOLD = 0.5  // gallery fails if >50% of previews fail
