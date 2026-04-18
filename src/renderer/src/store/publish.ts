import { create } from 'zustand'
import type {
  PublishStatus, ImageUploadRecord, PublishProgress,
  QueueItem, QueueConfig, PersistedQueueState,
} from '../lib/uploadTypes'
import { DEFAULT_QUEUE_CONFIG } from '../lib/uploadTypes'

// ─── Face Indexing Progress ─────────────────────────────────────────────────

export type FaceIndexStatus = 'idle' | 'pending' | 'indexing' | 'done' | 'failed'

export interface FaceIndexState {
  enabled: boolean
  status: FaceIndexStatus
  total: number
  indexed: number
  failed: number
  currentFile?: string
  error?: string
}

const initialFaceIndex: FaceIndexState = {
  enabled: false,
  status: 'idle',
  total: 0,
  indexed: 0,
  failed: 0,
}

// ─── Publish Store ──────────────────────────────────────────────────────────

export interface PublishState {
  // Gallery-level state
  galleryId: string | null
  galleryName: string
  localGalleryId: string
  publishStatus: PublishStatus
  publicUrl: string | null
  /** Wall-clock ms at which the active publish run started. Used to compute
   *  upload throughput and ETA. Reset to null by `reset()`. */
  startedAt: number | null

  // Per-image tracking
  images: ImageUploadRecord[]

  // Queue
  queueItems: QueueItem[]
  queueConfig: QueueConfig
  isPaused: boolean

  // Aggregate progress
  progress: PublishProgress

  // Face indexing (runs in background after publish)
  faceIndex: FaceIndexState

  // Recovery
  hasPendingRecovery: boolean
  recoveryState: PersistedQueueState | null

  // Actions
  startPublish: (galleryId: string, galleryName: string, localGalleryId: string, images: ImageUploadRecord[]) => void
  setPublishStatus: (status: PublishStatus) => void
  setPublicUrl: (url: string) => void
  updateImage: (filename: string, updates: Partial<ImageUploadRecord>) => void
  setQueueItems: (items: QueueItem[]) => void
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void
  setPaused: (paused: boolean) => void
  setFaceIndex: (partial: Partial<FaceIndexState>) => void
  setRecovery: (state: PersistedQueueState | null) => void
  dismissRecovery: () => void
  recalculateProgress: () => void
  reset: () => void
}

const initialProgress: PublishProgress = {
  phase: 'draft',
  totalImages: 0,
  thumbsUploaded: 0,
  previewsUploaded: 0,
  originalsUploaded: 0,
  originalsFailed: 0,
  originalsQueued: 0,
  failedImages: [],
  percent: 0,
}

export const usePublish = create<PublishState>((set, get) => ({
  galleryId: null,
  galleryName: '',
  localGalleryId: '',
  publishStatus: 'draft',
  publicUrl: null,
  startedAt: null,
  images: [],
  queueItems: [],
  queueConfig: DEFAULT_QUEUE_CONFIG,
  isPaused: false,
  progress: { ...initialProgress },
  faceIndex: { ...initialFaceIndex },
  hasPendingRecovery: false,
  recoveryState: null,

  startPublish: (galleryId, galleryName, localGalleryId, images) => {
    set({
      galleryId,
      galleryName,
      localGalleryId,
      publishStatus: 'preparing_assets',
      publicUrl: null,
      startedAt: Date.now(),
      images,
      queueItems: [],
      isPaused: false,
      progress: {
        ...initialProgress,
        phase: 'preparing_assets',
        totalImages: images.length,
      },
      faceIndex: { ...initialFaceIndex },
    })
  },

  setFaceIndex: (partial) => set(state => ({
    faceIndex: { ...state.faceIndex, ...partial },
  })),

  setPublishStatus: (status) => {
    set(state => ({
      publishStatus: status,
      progress: { ...state.progress, phase: status },
    }))
  },

  setPublicUrl: (url) => set({ publicUrl: url }),

  updateImage: (filename, updates) => {
    set(state => ({
      images: state.images.map(img =>
        img.filename === filename ? { ...img, ...updates } : img
      ),
    }))
    get().recalculateProgress()
  },

  setQueueItems: (items) => {
    set({ queueItems: items })
    get().recalculateProgress()
  },

  updateQueueItem: (id, updates) => {
    set(state => ({
      queueItems: state.queueItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }))
    get().recalculateProgress()
  },

  setPaused: (paused) => set({ isPaused: paused }),

  setRecovery: (state) => set({
    hasPendingRecovery: state !== null,
    recoveryState: state,
  }),

  dismissRecovery: () => set({
    hasPendingRecovery: false,
    recoveryState: null,
  }),

  recalculateProgress: () => {
    const { queueItems, images, publishStatus } = get()

    const thumbItems = queueItems.filter(i => i.type === 'thumbnail')
    const previewItems = queueItems.filter(i => i.type === 'web_preview')
    const originalItems = queueItems.filter(i => i.type === 'original')

    const thumbsUploaded = thumbItems.filter(i => i.status === 'completed').length
    const previewsUploaded = previewItems.filter(i => i.status === 'completed').length
    const originalsUploaded = originalItems.filter(i => i.status === 'completed').length
    const originalsFailed = originalItems.filter(i => i.status === 'failed').length
    const originalsQueued = originalItems.filter(i => i.status === 'pending' || i.status === 'paused').length

    const failedImages = queueItems
      .filter(i => i.status === 'failed' && (i.type === 'thumbnail' || i.type === 'web_preview'))
      .map(i => ({ filename: i.filename, reason: i.error || 'Unknown error' }))

    // Preview progress (blocking phase): thumbs + previews
    const previewTotal = thumbItems.length + previewItems.length
    const previewDone = thumbsUploaded + previewsUploaded
    const previewPercent = previewTotal > 0 ? Math.round((previewDone / previewTotal) * 100) : 0

    // If we're in originals phase, show originals progress
    const isOriginalsPhase = publishStatus === 'uploading_originals' || publishStatus === 'fully_live' || publishStatus === 'partially_failed'
    const totalDone = previewDone + originalsUploaded
    const totalAll = previewTotal + originalItems.length
    const overallPercent = isOriginalsPhase
      ? (totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 100)
      : previewPercent

    // Current file
    const inProgress = queueItems.find(i => i.status === 'in_progress')

    set({
      progress: {
        phase: publishStatus,
        totalImages: images.length,
        thumbsUploaded,
        previewsUploaded,
        originalsUploaded,
        originalsFailed,
        originalsQueued,
        failedImages,
        currentFile: inProgress?.filename,
        percent: overallPercent,
      },
    })
  },

  reset: () => set({
    galleryId: null,
    galleryName: '',
    localGalleryId: '',
    publishStatus: 'draft',
    publicUrl: null,
    startedAt: null,
    images: [],
    queueItems: [],
    isPaused: false,
    progress: { ...initialProgress },
    faceIndex: { ...initialFaceIndex },
  }),
}))
