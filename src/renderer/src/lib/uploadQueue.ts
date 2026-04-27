import { supabase } from './supabase'
import * as tus from 'tus-js-client'
import type {
  QueueItem, QueueItemStatus, QueueConfig, PersistedQueueState,
  UploadMethod,
} from './uploadTypes'
import {
  STANDARD_UPLOAD_LIMIT, SAFE_UPLOAD_LIMIT, ORIGINAL_TUS_THRESHOLD,
  TUS_CHUNK_SIZE, BUCKET, MAX_RETRIES, DEFAULT_QUEUE_CONFIG,
} from './uploadTypes'

// ─── Logger ─────────────────────────────────────────────────────────────────

function log(step: string, detail?: string | number) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[queue ${ts}] ${step}${detail != null ? ` — ${detail}` : ''}`)
}

// ─── Supabase URL / Token ───────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

async function getSupabaseToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY
}

// ─── Upload Primitives ──────────────────────────────────────────────────────

function tusUpload(
  bucket: string,
  storagePath: string,
  blob: Blob,
  contentType: string,
  token: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: TUS_CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: storagePath,
        contentType,
      },
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

async function standardUploadWithRetry(
  bucket: string,
  storagePath: string,
  blob: Blob,
  contentType: string
): Promise<{ error: string | null }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, blob, { contentType, upsert: true })
    if (!error) return { error: null }

    if (error.message?.includes('Payload too large') || error.message?.includes('413')) {
      return { error: `File too large: ${error.message}` }
    }

    if (attempt < MAX_RETRIES) {
      log('retry', `${storagePath} attempt ${attempt + 2}/${MAX_RETRIES + 1}`)
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    } else {
      return { error: error.message }
    }
  }
  return { error: 'Max retries exceeded' }
}

// ─── Smart Upload Router ────────────────────────────────────────────────────

export async function uploadBlob(
  storagePath: string,
  blob: Blob,
  contentType: string,
  itemType: 'thumbnail' | 'web_preview' | 'original',
  token: string
): Promise<{ error: string | null; method: UploadMethod }> {
  const sizeMB = blob.size / 1024 / 1024

  // Thumbnails: always standard
  if (itemType === 'thumbnail') {
    log('upload:thumb:standard', `${storagePath} (${sizeMB.toFixed(2)}MB)`)
    const result = await standardUploadWithRetry(BUCKET, storagePath, blob, contentType)
    return { ...result, method: 'standard' }
  }

  // Web previews: standard if small, TUS if large
  if (itemType === 'web_preview') {
    if (blob.size > SAFE_UPLOAD_LIMIT) {
      log('upload:preview:tus', `${storagePath} (${sizeMB.toFixed(1)}MB)`)
      try {
        await tusUpload(BUCKET, storagePath, blob, contentType, token)
        return { error: null, method: 'tus' }
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err), method: 'tus' }
      }
    }
    log('upload:preview:standard', `${storagePath} (${sizeMB.toFixed(2)}MB)`)
    const result = await standardUploadWithRetry(BUCKET, storagePath, blob, contentType)
    return { ...result, method: 'standard' }
  }

  // Originals: TUS if > 5MB, standard otherwise. Never standard above 5MB.
  if (blob.size > ORIGINAL_TUS_THRESHOLD) {
    log('upload:original:tus', `${storagePath} (${sizeMB.toFixed(1)}MB)`)
    try {
      await tusUpload(BUCKET, storagePath, blob, contentType, token)
      return { error: null, method: 'tus' }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Never retry size errors
      if (msg.includes('Payload too large') || msg.includes('413')) {
        return { error: `Size error: ${msg}`, method: 'tus' }
      }
      return { error: msg, method: 'tus' }
    }
  }

  log('upload:original:standard', `${storagePath} (${sizeMB.toFixed(2)}MB)`)
  const result = await standardUploadWithRetry(BUCKET, storagePath, blob, contentType)
  return { ...result, method: 'standard' }
}

// ─── Concurrent Queue Runner ────────────────────────────────────────────────

export type QueueEventHandler = (item: QueueItem, allItems: QueueItem[]) => void

interface QueueRunnerOptions {
  config: QueueConfig
  onItemStart: QueueEventHandler
  onItemComplete: QueueEventHandler
  onItemFailed: (item: QueueItem, error: string, allItems: QueueItem[]) => void
  onPhaseComplete: (phase: 'previews' | 'originals') => void
  /** Called to get the data blob for an item. Separates data loading from queue logic. */
  getBlob: (item: QueueItem) => Promise<{ blob: Blob; contentType: string } | null>
  /** Called to persist queue state after each status change */
  persist: (items: QueueItem[]) => void
}

export class UploadQueueRunner {
  private items: QueueItem[]
  private opts: QueueRunnerOptions
  private token: string = ''
  private _paused = false
  private _aborted = false
  private _pauseResolve: (() => void) | null = null

  constructor(items: QueueItem[], opts: QueueRunnerOptions) {
    this.items = items
    this.opts = opts
  }

  get paused() { return this._paused }
  get aborted() { return this._aborted }

  pause() {
    this._paused = true
    log('queue:paused', '')
  }

  resume() {
    this._paused = false
    if (this._pauseResolve) {
      this._pauseResolve()
      this._pauseResolve = null
    }
    log('queue:resumed', '')
  }

  abort() {
    this._aborted = true
    this.resume() // unblock any paused wait
  }

  private async waitIfPaused() {
    if (!this._paused) return
    await new Promise<void>(resolve => { this._pauseResolve = resolve })
  }

  private updateItem(id: string, updates: Partial<QueueItem>) {
    const item = this.items.find(i => i.id === id)
    if (item) Object.assign(item, updates)
    this.opts.persist([...this.items])
  }

  /** Run items of a given type with specified concurrency */
  private async runBatch(
    type: 'thumbnail' | 'web_preview' | 'original',
    concurrency: number
  ): Promise<void> {
    const pending = this.items.filter(i => i.type === type && (i.status === 'pending' || i.status === 'paused'))
    if (pending.length === 0) return

    log(`queue:batch:${type}`, `${pending.length} items, concurrency=${concurrency}`)

    let cursor = 0
    const running = new Set<Promise<void>>()

    const processOne = async (item: QueueItem) => {
      if (this._aborted) return
      await this.waitIfPaused()
      if (this._aborted) return

      this.updateItem(item.id, { status: 'in_progress', startedAt: Date.now() })
      this.opts.onItemStart(item, this.items)

      const blobResult = await this.opts.getBlob(item)
      if (!blobResult) {
        this.updateItem(item.id, { status: 'failed', error: 'Could not read file' })
        this.opts.onItemFailed(item, 'Could not read file', this.items)
        return
      }

      const { blob, contentType } = blobResult
      const { error, method } = await uploadBlob(
        item.storagePath, blob, contentType, item.type, this.token
      )

      const elapsed = Date.now() - (item.startedAt || Date.now())

      if (error) {
        this.updateItem(item.id, { status: 'failed', error, uploadMethod: method, elapsedMs: elapsed })
        this.opts.onItemFailed(item, error, this.items)
      } else {
        this.updateItem(item.id, { status: 'completed', uploadMethod: method, completedAt: Date.now(), elapsedMs: elapsed })
        this.opts.onItemComplete(item, this.items)
      }
    }

    while (cursor < pending.length || running.size > 0) {
      if (this._aborted) break

      // Fill up to concurrency
      while (cursor < pending.length && running.size < concurrency) {
        if (this._aborted) break
        const item = pending[cursor++]
        const p = processOne(item).then(() => { running.delete(p) })
        running.add(p)
      }

      // Wait for at least one to finish
      if (running.size > 0) {
        await Promise.race(running)
      }
    }
  }

  /** Run the full queue: previews first (blocking), then originals (background) */
  async run(): Promise<{ previewsDone: boolean; originalsDone: boolean }> {
    this.token = await getSupabaseToken()

    // Phase 1: Thumbnails (high priority, concurrent)
    await this.runBatch('thumbnail', this.opts.config.previewConcurrency)
    if (this._aborted) return { previewsDone: false, originalsDone: false }

    // Phase 2: Web previews (high priority, concurrent)
    await this.runBatch('web_preview', this.opts.config.previewConcurrency)
    if (this._aborted) return { previewsDone: false, originalsDone: false }

    const previewsFailed = this.items.filter(i =>
      (i.type === 'thumbnail' || i.type === 'web_preview') && i.status === 'failed'
    ).length
    const previewsDone = previewsFailed === 0

    this.opts.onPhaseComplete('previews')

    // Phase 3: Originals (low priority, concurrent, background)
    await this.runBatch('original', this.opts.config.originalConcurrency)

    const originalsFailed = this.items.filter(i => i.type === 'original' && i.status === 'failed').length
    const originalsDone = originalsFailed === 0

    this.opts.onPhaseComplete('originals')

    return { previewsDone, originalsDone }
  }

  /** Retry all failed original items */
  async retryFailedOriginals(): Promise<void> {
    for (const item of this.items) {
      if (item.type === 'original' && item.status === 'failed') {
        item.status = 'pending'
        item.error = undefined
      }
    }
    this.opts.persist([...this.items])
    this.token = await getSupabaseToken()
    await this.runBatch('original', this.opts.config.originalConcurrency)
    this.opts.onPhaseComplete('originals')
  }

  getItems(): QueueItem[] {
    return [...this.items]
  }
}

// ─── Queue Persistence ──────────────────────────────────────────────────────

const QUEUE_PREF_KEY = 'pendingUploadQueue'

export async function persistQueue(state: PersistedQueueState): Promise<void> {
  await window.api.setPref(QUEUE_PREF_KEY, state)
}

export async function loadPersistedQueue(): Promise<PersistedQueueState | null> {
  const raw = await window.api.getPref(QUEUE_PREF_KEY)
  if (!raw || typeof raw !== 'object') return null
  return raw as PersistedQueueState
}

export async function clearPersistedQueue(): Promise<void> {
  await window.api.setPref(QUEUE_PREF_KEY, null)
}

// ─── Queue Builder ──────────────────────────────────────────────────────────

let queueIdCounter = 0

export function buildQueueItems(
  galleryId: string,
  images: Array<{
    filename: string
    localPath: string
    originalSizeBytes: number
    /** Optional path-hash prefix for uniqueness across same-named files in
     *  different sections. When omitted, falls back to legacy unprefixed
     *  paths so older callers keep working. */
    pathHashPrefix?: string
    thumbBlob?: Blob
    webBlob?: Blob
  }>,
  slug?: string
): QueueItem[] {
  const items: QueueItem[] = []

  for (const img of images) {
    const base = slug ? `${slug}/${galleryId}` : `${galleryId}`
    const stem = img.pathHashPrefix ? `${img.pathHashPrefix}_${img.filename}` : img.filename

    items.push({
      id: `q_${++queueIdCounter}_thumb_${stem}`,
      galleryId,
      filename: img.filename,
      localPath: img.localPath,
      storagePath: `${base}/thumbs/${stem}`,
      type: 'thumbnail',
      priority: 'high',
      status: 'pending',
      sizeBytes: 0, // filled after compression
    })

    items.push({
      id: `q_${++queueIdCounter}_preview_${stem}`,
      galleryId,
      filename: img.filename,
      localPath: img.localPath,
      storagePath: `${base}/web/${stem}`,
      type: 'web_preview',
      priority: 'high',
      status: 'pending',
      sizeBytes: 0,
    })

    items.push({
      id: `q_${++queueIdCounter}_orig_${stem}`,
      galleryId,
      filename: img.filename,
      localPath: img.localPath,
      storagePath: `${base}/originals/${stem}`,
      type: 'original',
      priority: 'low',
      status: 'pending',
      sizeBytes: img.originalSizeBytes,
    })
  }

  return items
}
