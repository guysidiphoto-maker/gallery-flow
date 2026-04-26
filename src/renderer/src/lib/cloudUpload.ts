import { supabase } from './supabase'
import * as tus from 'tus-js-client'
import { usePublish } from '../store/publish'
import { requireBusiness, requireBusinessId } from './sessionGuards'
import {
  UploadQueueRunner, buildQueueItems,
  persistQueue, clearPersistedQueue,
} from './uploadQueue'
import type {
  ImageUploadRecord, CompressionResult,
  QueueItem, PersistedQueueState,
} from './uploadTypes'
import {
  BUCKET, STORY_BUCKET, STANDARD_UPLOAD_LIMIT, TUS_CHUNK_SIZE,
  PREVIEW_FAILURE_THRESHOLD, GALLERY_BASE, DEFAULT_QUEUE_CONFIG,
} from './uploadTypes'
import { startFaceIndexingInBackground, resumeFaceIndexingIfEnabled, deleteCollection, deleteImageFaces } from './faceIndex'

// ─── Logger ─────────────────────────────────────────────────────────────────

function log(step: string, detail?: string | number) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[publish ${ts}] ${step}${detail != null ? ` — ${detail}` : ''}`)
}

// ─── Supabase helpers ───────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

async function getSupabaseToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY
}

// ─── Active queue runner (singleton for pause/resume/retry) ─────────────────

let activeRunner: UploadQueueRunner | null = null

export function getActiveRunner(): UploadQueueRunner | null {
  return activeRunner
}

// ─── Filename helpers ──────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[^\x20-\x7E]/g, '')                     // remove non-ASCII (Hebrew etc.)
    .replace(/\s+/g, '_')                              // spaces → underscore
    .replace(/[^a-zA-Z0-9._\-]/g, '')                 // only safe chars
    || `img_${Date.now()}`                             // fallback if empty
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  return 'image/jpeg'
}

// ─── Main Publish Orchestrator ──────────────────────────────────────────────

export interface PublishSectionInput {
  /** Local id (nanoid) used by the renderer's sections store. */
  localId: string
  name: string
  sortOrder: number
  /** Source paths of the images that belong to this section. */
  imagePaths: string[]
}

export async function publishGallery(
  galleryName: string,
  clientName: string | null,
  clientLocalId: string | null,
  localGalleryId: string,
  imagePaths: string[],
  topPickIds: Set<string>,
  deliverySettings: Record<string, unknown> & { downloadQuality?: string },
  sections: PublishSectionInput[] = [],
): Promise<{ galleryId: string; publicUrl: string }> {
  // Resolve the owning business BEFORE any DB writes. This guarantees we
  // never insert an unowned row that RLS will silently reject (or worse,
  // accept and orphan). Throws a clear error when called from a context
  // without an authenticated session + business.
  const business = requireBusiness()
  const businessId = business.id
  const slug = business.slug

  // ── Plan limit check ──────────────────────────────────────────────────
  const { fetchPlanLimits, checkPlanViolations } = await import('./planGuard')
  const limits = await fetchPlanLimits()
  if (limits) {
    const AVG_BYTES_PER_IMAGE = 15.5 * 1024 * 1024
    const violations = checkPlanViolations(limits, imagePaths.length, imagePaths.length * AVG_BYTES_PER_IMAGE)
    if (violations.length > 0) {
      const msg = violations.map(v => v.label).join('\n')
      throw new Error(`PLAN_LIMIT\n${limits.planName}\n${msg}`)
    }
  }

  // Reset any previous publish state first
  usePublish.getState().reset()
  const store = usePublish.getState()

  // sanitizeFilename is now a module-level function (shared with updateGalleryImages)

  // Build initial image records
  const imageRecords: ImageUploadRecord[] = imagePaths.map((p, i) => ({
    filename: sanitizeFilename(p.split('/').pop() || `img_${i}`),
    localPath: p,
    status: 'pending',
    thumbnailUploaded: false,
    webPreviewUploaded: false,
    originalUploaded: false,
  }))

  // Initialize store (galleryId set to empty until DB record created)
  store.startPublish('', galleryName, localGalleryId, imageRecords)

  log('start', `${imagePaths.length} images`)

  // ── Step 1: Upsert client (scoped to business) ────────────────────────

  let clientDbId: string | null = null
  if (clientLocalId && clientName) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('business_id', businessId)
      .eq('local_id', clientLocalId)
      .maybeSingle()
    if (existing) {
      clientDbId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase
        .from('clients')
        .insert({ business_id: businessId, local_id: clientLocalId, name: clientName })
        .select('id')
        .single()
      if (createErr) {
        store.setPublishStatus('failed')
        throw new Error(`Failed to create client: ${createErr.message}`)
      }
      if (created) clientDbId = created.id
    }
  }

  // ── Step 2: Create gallery record (owned by business) ────────────────

  const faceIndexEnabled = !!deliverySettings.faceIndexEnabled

  // Plaintext gallery passwords must never be persisted in the anon-readable
  // delivery_settings JSONB. Pull it out here and hand it to the
  // set_gallery_password RPC after the row exists so it gets bcrypted into
  // the dedicated password_hash column.
  const plaintextPassword =
    typeof deliverySettings.password === 'string' && deliverySettings.password.length > 0
      ? deliverySettings.password
      : null
  const sanitizedSettings = { ...deliverySettings }
  delete (sanitizedSettings as Record<string, unknown>).password

  const galleryPayload = {
    business_id: businessId,
    local_id: localGalleryId,
    name: galleryName,
    client_id: clientDbId,
    client_name: clientName,
    status: 'publishing',
    image_count: imagePaths.length,
    delivery_settings: sanitizedSettings,
    face_index_enabled: faceIndexEnabled,
    face_index_status: faceIndexEnabled ? 'pending' : null,
  }

  const { data: gallery, error: galleryError } = await supabase
    .from('galleries').insert(galleryPayload).select('id').single()

  if (galleryError || !gallery) {
    store.setPublishStatus('failed')
    throw new Error(`Failed to create gallery: ${galleryError?.message}`)
  }

  const galleryId = gallery.id
  const publicUrl = `${GALLERY_BASE}/${slug}/gallery/${galleryId}`
  usePublish.setState({ galleryId })
  store.setPublicUrl(publicUrl)
  log('gallery-created', galleryId)

  if (plaintextPassword) {
    const { error: pwErr } = await supabase.rpc('set_gallery_password', {
      p_gallery_id: galleryId,
      p_password: plaintextPassword,
    })
    if (pwErr) {
      store.setPublishStatus('failed')
      throw new Error(`Failed to set gallery password: ${pwErr.message}`)
    }
  }

  // ── Step 2a: Upload custom cover image if provided ────────────────────
  const coverImageUrl = sanitizedSettings.coverImageUrl as string | null
  if (coverImageUrl && typeof coverImageUrl === 'string' && !coverImageUrl.startsWith('http')) {
    // It's a local file path — upload to storage
    try {
      const buffer = await window.api.readFileBuffer(coverImageUrl)
      if (buffer) {
        const coverPath = `${slug}/${galleryId}/cover.jpg`
        const blob = new Blob([buffer], { type: 'image/jpeg' })
        const { error: coverErr } = await supabase.storage
          .from(BUCKET)
          .upload(coverPath, blob, { contentType: 'image/jpeg', upsert: true })
        if (!coverErr) {
          // Update delivery_settings with the storage URL
          const coverStorageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${coverPath}`
          sanitizedSettings.coverImageUrl = coverStorageUrl
          await supabase.from('galleries').update({
            delivery_settings: sanitizedSettings,
          }).eq('id', galleryId)
          log('cover-uploaded', coverPath)
        }
      }
    } catch (e) {
      console.warn('[publish] cover image upload failed:', e)
    }
  }

  // ── Step 2b: Create gallery_sections rows and build path→sectionId map ──
  // Each image will get its `section_id` set from this map at insert time.
  const sectionPathToDbId = new Map<string, string>()
  if (sections.length > 0) {
    const sectionRows = sections.map(s => ({
      gallery_id: galleryId,
      name: s.name,
      sort_order: s.sortOrder,
    }))
    const { data: insertedSections, error: secErr } = await supabase
      .from('gallery_sections')
      .insert(sectionRows)
      .select('id, name, sort_order')
    if (secErr || !insertedSections) {
      store.setPublishStatus('failed')
      throw new Error(`Failed to create gallery sections: ${secErr?.message}`)
    }
    // Pair the inserted rows back to their input by sort_order (stable, unique
    // per gallery during this insert batch).
    for (const inputSection of sections) {
      const matched = insertedSections.find(r => r.sort_order === inputSection.sortOrder && r.name === inputSection.name)
      if (!matched) continue
      for (const p of inputSection.imagePaths) {
        sectionPathToDbId.set(p, matched.id)
      }
    }
    log('sections-created', insertedSections.length)
  }

  // ── Step 3: Compress all images (CPU-safe, sequential) ────────────────

  store.setPublishStatus('preparing_assets')

  const compressedMap = new Map<string, CompressionResult>()
  const COMPRESS_BATCH = 3 // parallel compression — CPU safe

  for (let batch = 0; batch < imagePaths.length; batch += COMPRESS_BATCH) {
    const slice = imagePaths.slice(batch, batch + COMPRESS_BATCH)
    const batchRecords = imageRecords.slice(batch, batch + COMPRESS_BATCH)

    // Mark all in batch as generating
    for (const rec of batchRecords) store.updateImage(rec.filename, { status: 'generating_assets' })

    // Compress batch in parallel
    const results = await Promise.all(
      slice.map((path, j) =>
        window.api.compressImageForUpload(path).then(r => ({
          filename: batchRecords[j].filename,
          result: r as CompressionResult | null,
        }))
      )
    )

    for (const { filename, result } of results) {
      if (!result) {
        log('compress:failed', filename)
        store.updateImage(filename, { status: 'failed' })
        continue
      }

      compressedMap.set(filename, result)
      store.updateImage(filename, {
        status: 'pending',
        thumbnailSizeBytes: result.thumbSize,
        webPreviewSizeBytes: result.webSize,
        originalSizeBytes: result.originalSize,
        width: result.width,
        height: result.height,
        mimeType: mimeFromFilename(filename),
      })

      log('compressed', `${filename} ${result.width}x${result.height} orig=${(result.originalSize / 1024 / 1024).toFixed(1)}MB web=${(result.webSize / 1024).toFixed(0)}KB thumb=${(result.thumbSize / 1024).toFixed(0)}KB`)
    }
  }

  // Check how many failed compression
  const compressedImages = imageRecords.filter(img => compressedMap.has(img.filename))
  if (compressedImages.length === 0) {
    store.setPublishStatus('failed')
    await supabase.from('galleries').update({ status: 'failed' }).eq('id', galleryId)
    throw new Error('All images failed compression')
  }

  // ── Step 4: Build queue ───────────────────────────────────────────────

  store.setPublishStatus('uploading_previews')

  const queueInputs = compressedImages.map(img => ({
    filename: img.filename,
    localPath: img.localPath,
    originalSizeBytes: compressedMap.get(img.filename)!.originalSize,
  }))

  const queueItems = buildQueueItems(galleryId, queueInputs, slug)

  // Fill in sizes for thumb/preview items
  for (const item of queueItems) {
    const cr = compressedMap.get(item.filename)
    if (!cr) continue
    if (item.type === 'thumbnail') item.sizeBytes = cr.thumbSize
    if (item.type === 'web_preview') item.sizeBytes = cr.webSize
    if (item.type === 'original') item.sizeBytes = cr.originalSize
  }

  store.setQueueItems(queueItems)

  // ── Step 5: Run queue ─────────────────────────────────────────────────

  const runner = new UploadQueueRunner(queueItems, {
    config: DEFAULT_QUEUE_CONFIG,

    getBlob: async (item: QueueItem) => {
      if (item.type === 'thumbnail') {
        const cr = compressedMap.get(item.filename)
        if (!cr) return null
        return { blob: new Blob([cr.thumb], { type: 'image/jpeg' }), contentType: 'image/jpeg' }
      }
      if (item.type === 'web_preview') {
        const cr = compressedMap.get(item.filename)
        if (!cr) return null
        return { blob: new Blob([cr.web], { type: 'image/jpeg' }), contentType: 'image/jpeg' }
      }
      // Original: read raw file from disk
      const buffer = await window.api.readFileBuffer(item.localPath)
      if (!buffer) return null
      const contentType = mimeFromFilename(item.filename)
      return { blob: new Blob([buffer], { type: contentType }), contentType }
    },

    onItemStart: (item) => {
      const statusMap = {
        thumbnail: 'uploading_thumbnail' as const,
        web_preview: 'uploading_preview' as const,
        original: 'uploading_original' as const,
      }
      store.updateImage(item.filename, { status: statusMap[item.type] })
    },

    onItemComplete: (item) => {
      if (item.type === 'thumbnail') {
        store.updateImage(item.filename, { thumbnailUploaded: true })
      } else if (item.type === 'web_preview') {
        store.updateImage(item.filename, { webPreviewUploaded: true, status: 'preview_ready' })
      } else {
        store.updateImage(item.filename, {
          originalUploaded: true,
          originalUploadMethod: item.uploadMethod,
          status: 'original_ready',
        })
        // Original upload tracked in local store
      }
      store.setQueueItems(runner.getItems())
    },

    onItemFailed: (item, error) => {
      if (item.type === 'original') {
        store.updateImage(item.filename, {
          status: 'original_failed',
          originalFailedReason: error,
        })
        // original_uploaded stays false — can retry later
      } else {
        store.updateImage(item.filename, { status: 'failed' })
      }
      store.setQueueItems(runner.getItems())
    },

    onPhaseComplete: (phase) => {
      if (phase === 'previews') {
        log('phase:previews-done', `thumbs=${store.progress.thumbsUploaded} previews=${store.progress.previewsUploaded}`)
      } else {
        log('phase:originals-done', `uploaded=${store.progress.originalsUploaded} failed=${store.progress.originalsFailed}`)
      }
    },

    persist: (items) => {
      store.setQueueItems(items)
      // Persist to disk for recovery
      const persistState: PersistedQueueState = {
        galleryId,
        galleryName,
        localGalleryId,
        publishStatus: store.publishStatus,
        items,
        images: store.images,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      persistQueue(persistState)
    },
  })

  activeRunner = runner

  // Start the queue — previews run first (blocking)
  const runPromise = runner.run()

  // Wait for previews to complete before going live
  // The runner processes thumbs → previews → originals sequentially by type
  // We need to intercept after previews are done

  const { previewsDone } = await runPromise

  // ── Step 6: Evaluate preview results ──────────────────────────────────

  const totalPreviewable = compressedImages.length
  const previewsUploaded = usePublish.getState().progress.previewsUploaded
  const failureRate = 1 - (previewsUploaded / totalPreviewable)

  if (failureRate > PREVIEW_FAILURE_THRESHOLD) {
    store.setPublishStatus('failed')
    await supabase.from('galleries').update({ status: 'failed' }).eq('id', galleryId)
    activeRunner = null
    throw new Error(`Too many preview failures (${Math.round(failureRate * 100)}%). Gallery cannot go live.`)
  }

  // ── Step 7: Insert image records ──────────────────────────────────────

  log('inserting-records', compressedImages.length)

  let insertedCount = 0
  let firstInsertError: string | null = null
  for (let i = 0; i < imagePaths.length; i++) {
    // IMPORTANT: use the sanitized filename from imageRecords, not the raw
    // basename of imagePaths. compressedMap + the upload queue are both
    // keyed on the sanitized name; looking up by the raw filename misses
    // every image with a space/Hebrew/non-ASCII char and silently drops it.
    const filename = imageRecords[i].filename
    const cr = compressedMap.get(filename)
    if (!cr) continue
    const isTopPick = topPickIds.has(imagePaths[i])

    const payload = {
      gallery_id: galleryId,
      filename,
      web_preview_path: `${slug}/${galleryId}/web/${filename}`,
      original_path: `${slug}/${galleryId}/originals/${filename}`,
      thumbnail_path: `${slug}/${galleryId}/thumbs/${filename}`,
      is_top_pick: isTopPick,
      sort_order: i,
      section_id: sectionPathToDbId.get(imagePaths[i]) ?? null,
    }

    const { error: imgError } = await supabase.from('images').insert(payload).select('id')
    if (imgError) {
      console.error(`[image-insert] FAILED ${filename}:`, imgError.message)
      if (!firstInsertError) firstInsertError = imgError.message
    } else {
      insertedCount++
    }
  }

  // If every insert failed (e.g. schema drift, RLS denial), don't quietly
  // mark the gallery live with zero images — fail loudly so the photographer
  // sees it and we don't ship empty galleries to clients.
  if (insertedCount === 0 && compressedImages.length > 0) {
    store.setPublishStatus('failed')
    await supabase.from('galleries').update({ status: 'failed' }).eq('id', galleryId)
    throw new Error(`No image records were saved (${compressedImages.length} attempted). First error: ${firstInsertError ?? 'unknown'}`)
  }

  // ── Step 8: Mark preview_live ─────────────────────────────────────────

  store.setPublishStatus('preview_live')
  await supabase.from('galleries').update({
    status: 'live',
    public_url: publicUrl,
    published_at: new Date().toISOString(),
  }).eq('id', galleryId)

  log('preview-live', publicUrl)

  // Bump monthly usage counters now that the gallery is live
  import('./planGuard').then(({ bumpUsage }) => bumpUsage(imagePaths.length)).catch(() => {})

  // Kick off face indexing in the background — never blocks the gallery
  // from being shown to the client. The edge function owns the loop via
  // EdgeRuntime.waitUntil, so this client's lifetime doesn't matter.
  if (faceIndexEnabled) {
    startFaceIndexingInBackground(galleryId)
  }

  // Free compression cache (originals read from disk as needed)
  compressedMap.clear()

  // ── Step 9: Originals continue in background ─────────────────────────

  // The queue runner already processed originals as part of run().
  // Evaluate final state.
  const finalProgress = usePublish.getState().progress

  if (finalProgress.originalsFailed === 0 && finalProgress.originalsUploaded === finalProgress.totalImages) {
    store.setPublishStatus('fully_live')
    log('fully-live', galleryId)
  } else if (finalProgress.originalsFailed > 0) {
    store.setPublishStatus('partially_failed')
    log('partially-failed', `${finalProgress.originalsFailed} originals failed`)
  } else {
    store.setPublishStatus('uploading_originals')
  }

  // Clear persisted queue on success
  if (finalProgress.originalsFailed === 0) {
    await clearPersistedQueue()
  }

  activeRunner = null
  return { galleryId, publicUrl }
}

// ─── Retry Failed Originals ─────────────────────────────────────────────────

export async function retryFailedOriginals(): Promise<void> {
  const store = usePublish.getState()
  if (!store.galleryId) return

  const runner = activeRunner
  if (!runner) {
    log('retry:no-runner', 'No active queue runner')
    return
  }

  store.setPublishStatus('uploading_originals')

  await runner.retryFailedOriginals()

  const progress = usePublish.getState().progress
  if (progress.originalsFailed === 0) {
    store.setPublishStatus('fully_live')
    // originals all done — tracked in local store only
    await clearPersistedQueue()
  } else {
    store.setPublishStatus('partially_failed')
  }
}

// ─── Pause / Resume ─────────────────────────────────────────────────────────

export function pauseOriginals(): void {
  const runner = activeRunner
  if (runner) runner.pause()
  usePublish.getState().setPaused(true)
}

export function resumeOriginals(): void {
  const runner = activeRunner
  if (runner) runner.resume()
  usePublish.getState().setPaused(false)
}

export function cancelUpload(): void {
  const runner = activeRunner
  if (runner) runner.abort()
  activeRunner = null
  usePublish.getState().setPublishStatus('failed')
  clearPersistedQueue()
  log('upload:cancelled', '')
}

// ─── Story Upload (unchanged) ───────────────────────────────────────────────

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
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: bucket, objectName: storagePath, contentType },
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

export async function uploadStoryToCloud(
  galleryId: string,
  style: string,
  storyFilePath: string,
  sectionId: string | null = null,
): Promise<{ skipped: boolean; reason?: string }> {
  const fileSize = await window.api.getFileSize(storyFilePath)
  if (fileSize === null) return { skipped: true, reason: 'Could not read story file' }

  log('story', `${style} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`)

  const buffer = await window.api.readFileBuffer(storyFilePath)
  if (!buffer) return { skipped: true, reason: 'Could not read story file' }

  const businessSlug = requireBusiness().slug
  // Section-scoped stories get a sub-path so two sections don't overwrite
  // each other's video for the same style.
  const fileTag = sectionId ? `sec_${sectionId.slice(0, 8)}_${style}` : `story_${style}`
  const storagePath = sectionId
    ? `${businessSlug}/${galleryId}/sections/${sectionId}/${fileTag}.mp4`
    : `${businessSlug}/${galleryId}/${fileTag}.mp4`

  try {
    if (fileSize <= STANDARD_UPLOAD_LIMIT) {
      const blob = new Blob([buffer], { type: 'video/mp4' })
      const { error } = await supabase.storage
        .from(STORY_BUCKET)
        .upload(storagePath, blob, { contentType: 'video/mp4', upsert: true })
      if (error) return { skipped: true, reason: `Upload failed: ${error.message}` }
    } else {
      const token = await getSupabaseToken()
      const blob = new Blob([buffer], { type: 'video/mp4' })
      await tusUpload(STORY_BUCKET, storagePath, blob, 'video/mp4', token)
    }
  } catch (err: unknown) {
    return { skipped: true, reason: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  await supabase.from('stories').insert({
    gallery_id: galleryId,
    style,
    storage_path: storagePath,
    section_id: sectionId,
  })
  log('story-done', `${style}${sectionId ? ` [section ${sectionId.slice(0, 8)}]` : ''}`)
  return { skipped: false }
}

// ─── Delete existing stories for a gallery ─────────────────────────────────
// Used before regenerating: clears the old story rows + their storage objects
// so the next upload doesn't create duplicate rows alongside the old ones.
export async function deleteStoriesForGallery(galleryDbId: string): Promise<{ error: string | null }> {
  const { data: stories, error: selErr } = await supabase
    .from('stories')
    .select('id, storage_path')
    .eq('gallery_id', galleryDbId)
  if (selErr) return { error: selErr.message }

  if (stories && stories.length > 0) {
    const paths = stories.map(s => s.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) {
      await supabase.storage.from(STORY_BUCKET).remove(paths)
    }
    const { error: delErr } = await supabase.from('stories').delete().eq('gallery_id', galleryDbId)
    if (delErr) return { error: delErr.message }
    log('delete-stories', `${stories.length} stories cleared`)
  }
  return { error: null }
}

// ─── Mark Gallery Live (called after stories complete) ──────────────────────

export async function markGalleryLive(galleryId: string, publicUrl: string): Promise<void> {
  // Gallery is already marked live during preview_live phase.
  // This is kept for backward compat with story flow.
  const { error } = await supabase
    .from('galleries')
    .update({ status: 'live', public_url: publicUrl, published_at: new Date().toISOString() })
    .eq('id', galleryId)
    .select('id')

  if (error) {
    throw new Error(`markGalleryLive failed: ${error.message}`)
  }
}

// ─── Delete Gallery from Cloud ──────────────────────────────────────────────

export async function deleteGalleryFromCloud(
  galleryDbIdOrLocalId: string
): Promise<{ error: string | null }> {
  log('delete-gallery:start', galleryDbIdOrLocalId)

  // Resolve gallery DB id
  let galleryDbId = galleryDbIdOrLocalId
  const isUuid = /^[0-9a-f]{8}-/.test(galleryDbId)
  if (!isUuid) {
    const { data } = await supabase.from('galleries').select('id').eq('local_id', galleryDbId).single()
    if (!data) return { error: null } // not published — nothing to delete
    galleryDbId = data.id
  }

  // Delete the Rekognition collection first (best-effort, never fatal).
  // We do this before the DB delete so we still know the gallery exists
  // when the edge function checks ownership.
  await deleteCollection(galleryDbId)

  // 1. Get all images to delete from storage (paths stored in DB)
  const { data: imgs } = await supabase.from('images').select('filename, storage_path:web_preview_path, original_path, thumbnail_path').eq('gallery_id', galleryDbId)

  if (imgs && imgs.length > 0) {
    // 2. Delete files from storage using DB-stored paths
    const paths = imgs.flatMap(img => [
      img.thumbnail_path,
      img.storage_path,
      img.original_path,
    ].filter(Boolean))
    await supabase.storage.from(BUCKET).remove(paths)
    log('delete-gallery:storage', `${paths.length} files`)
  }

  // 3. Delete stories from storage
  const { data: stories } = await supabase.from('stories').select('storage_path').eq('gallery_id', galleryDbId)
  if (stories && stories.length > 0) {
    await supabase.storage.from(STORY_BUCKET).remove(stories.map(s => s.storage_path))
  }

  // 4. Delete DB records (images + stories cascade with gallery)
  await supabase.from('galleries').delete().eq('id', galleryDbId)
  log('delete-gallery:done', galleryDbId)

  return { error: null }
}

// ─── Delete Single Image from Cloud ─────────────────────────────────────────

export async function deleteImageFromCloud(
  galleryDbIdOrLocalId: string,
  filename: string
): Promise<{ error: string | null }> {
  log('delete-image:start', `${galleryDbIdOrLocalId} / ${filename}`)

  let galleryDbId = galleryDbIdOrLocalId
  const isUuid = /^[0-9a-f]{8}-/.test(galleryDbId)
  if (!isUuid) {
    const { data } = await supabase.from('galleries').select('id').eq('local_id', galleryDbId).single()
    if (!data) return { error: null }
    galleryDbId = data.id
  }

  // Delete from storage using DB-stored paths; also clean up face records
  // in Rekognition (best-effort) before the image row goes away.
  const { data: imgRow } = await supabase.from('images')
    .select('id, storage_path:web_preview_path, original_path, thumbnail_path')
    .eq('gallery_id', galleryDbId).eq('filename', filename).maybeSingle()
  if (imgRow) {
    await deleteImageFaces(galleryDbId, imgRow.id)
    const paths = [imgRow.thumbnail_path, imgRow.storage_path, imgRow.original_path].filter(Boolean)
    await supabase.storage.from(BUCKET).remove(paths)
  }

  // Delete from DB
  await supabase.from('images').delete().eq('gallery_id', galleryDbId).eq('filename', filename)

  // Update count
  const { count } = await supabase.from('images').select('id', { count: 'exact', head: true }).eq('gallery_id', galleryDbId)
  await supabase.from('galleries').update({ image_count: count || 0 }).eq('id', galleryDbId)

  log('delete-image:done', filename)
  return { error: null }
}

// ─── Update Gallery Images (order + removals, no re-upload) ─────────────────

export interface UpdateProgress {
  phase: 'starting' | 'removing' | 'uploading' | 'finalizing'
  current: number
  total: number
  filename?: string
}

export interface UpdateFailure {
  filename: string
  reason: string
}

export async function updateGalleryImages(
  galleryDbIdOrLocalId: string,
  currentImagePaths: string[],
  publishedImageIds: string[],
  imageRegistry: Record<string, { filename: string; path: string }>,
  onProgress?: (p: UpdateProgress) => void,
): Promise<{ error: string | null; failures?: UpdateFailure[]; uploaded?: number; expected?: number }> {
  onProgress?.({ phase: 'starting', current: 0, total: 0 })
  const failures: UpdateFailure[] = []
  log('update-images:start', `gallery=${galleryDbIdOrLocalId} current=${currentImagePaths.length} published=${publishedImageIds.length}`)

  // Resolve gallery DB id — could be UUID or local_id
  let galleryDbId = galleryDbIdOrLocalId
  const isUuid = /^[0-9a-f]{8}-/.test(galleryDbId)
  if (!isUuid) {
    const { data } = await supabase.from('galleries').select('id').eq('local_id', galleryDbId).eq('status', 'live').single()
    if (!data) return { error: 'Gallery not found' }
    galleryDbId = data.id
  }

  // Build current filename list from paths (sanitized for consistent matching)
  const currentFilenames = currentImagePaths.map(p => sanitizeFilename(p.split('/').pop() || ''))

  // Query cloud for actually-published filenames (single source of truth)
  const { data: cloudImages } = await supabase.from('images')
    .select('filename')
    .eq('gallery_id', galleryDbId)
  const publishedFilenames = (cloudImages || []).map(img => img.filename)

  // 1. Find removed images (in published but not in current)
  const currentSet = new Set(currentFilenames)
  const removed = publishedFilenames.filter(f => !currentSet.has(f))

  if (removed.length > 0) {
    log('update-images:removing', `${removed.length} images`)
    onProgress?.({ phase: 'removing', current: 0, total: removed.length })
    // Fetch DB-stored paths for removed images, then delete from storage + DB
    await Promise.all(removed.map(async (filename) => {
      const { data: imgRow } = await supabase.from('images')
        .select('id, storage_path:web_preview_path, original_path, thumbnail_path')
        .eq('gallery_id', galleryDbId).eq('filename', filename).maybeSingle()
      if (imgRow) {
        await deleteImageFaces(galleryDbId, imgRow.id)
        const paths = [imgRow.thumbnail_path, imgRow.storage_path, imgRow.original_path].filter(Boolean)
        await supabase.storage.from(BUCKET).remove(paths)
      }
      const { error } = await supabase
        .from('images')
        .delete()
        .eq('gallery_id', galleryDbId)
        .eq('filename', filename)
      if (error) log('update-images:remove-error', `${filename}: ${error.message}`)
    }))
  }

  // 2. Find added images (in current but not in published)
  const publishedSet = new Set(publishedFilenames)
  const addedPaths = currentImagePaths.filter(p => {
    const fn = sanitizeFilename(p.split('/').pop() || '')
    return !publishedSet.has(fn)
  })

  if (addedPaths.length > 0) {
    log('update-images:uploading', `${addedPaths.length} new images`)
    const slug = requireBusiness().slug

    onProgress?.({ phase: 'uploading', current: 0, total: addedPaths.length })

    // Compress, upload, and insert DB records for each new image
    for (let i = 0; i < addedPaths.length; i++) {
      const localPath = addedPaths[i]
      const filename = sanitizeFilename(localPath.split('/').pop() || `img_${i}`)
      onProgress?.({ phase: 'uploading', current: i, total: addedPaths.length, filename })

      try {
        // Compress
        const cr = await window.api.compressImageForUpload(localPath) as {
          thumb: Uint8Array; web: Uint8Array; original: Uint8Array
          thumbSize: number; webSize: number; originalSize: number
          width: number; height: number
        } | null
        if (!cr) {
          log('update-images:compress-failed', filename)
          failures.push({ filename, reason: 'compression failed (file may be missing or unreadable)' })
          continue
        }

        // Upload thumb, web preview, original
        const thumbPath = `${slug}/${galleryDbId}/thumbs/${filename}`
        const webPath = `${slug}/${galleryDbId}/web/${filename}`
        const origPath = `${slug}/${galleryDbId}/originals/${filename}`

        await Promise.all([
          supabase.storage.from(BUCKET).upload(thumbPath, new Blob([cr.thumb], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: true }),
          supabase.storage.from(BUCKET).upload(webPath, new Blob([cr.web], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: true }),
        ])

        // Upload original (may be large — use regular upload)
        const origBuffer = await window.api.readFileBuffer(localPath)
        if (origBuffer) {
          const contentType = mimeFromFilename(filename)
          await supabase.storage.from(BUCKET).upload(origPath, new Blob([origBuffer], { type: contentType }), { contentType, upsert: true })
        }

        // Insert DB record
        const sortOrder = currentImagePaths.indexOf(localPath)
        await supabase.from('images').insert({
          gallery_id: galleryDbId,
          filename,
          web_preview_path: webPath,
          original_path: origPath,
          thumbnail_path: thumbPath,
          is_top_pick: false,
          sort_order: sortOrder,
        })

        log('update-images:added', filename)
        onProgress?.({ phase: 'uploading', current: i + 1, total: addedPaths.length, filename })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        log('update-images:add-error', `${filename}: ${reason}`)
        failures.push({ filename, reason })
      }
    }
  }

  // 3. Update sort_order for all images
  log('update-images:reorder', `${currentFilenames.length} images`)
  onProgress?.({ phase: 'finalizing', current: 0, total: 0 })
  const sanitizedCurrentFilenames = currentImagePaths.map(p => sanitizeFilename(p.split('/').pop() || ''))
  await Promise.all(sanitizedCurrentFilenames.map((filename, i) =>
    supabase
      .from('images')
      .update({ sort_order: i })
      .eq('gallery_id', galleryDbId)
      .eq('filename', filename)
  ))

  // 4. Update gallery image_count
  const { count } = await supabase.from('images').select('id', { count: 'exact', head: true }).eq('gallery_id', galleryDbId)
  await supabase
    .from('galleries')
    .update({ image_count: count || currentFilenames.length })
    .eq('id', galleryDbId)

  // 4. If this gallery has face indexing enabled, fire the edge function
  //    to pick up any newly-added images. No-op when face indexing isn't
  //    turned on, or when every image is already indexed.
  resumeFaceIndexingIfEnabled(galleryDbId).catch(err => {
    log('update-images:face-resume-error', err instanceof Error ? err.message : String(err))
  })

  // Verify cloud actually has every expected image. Discrepancies happen when
  // an upload fails mid-flight; the user should see a clear count instead of
  // silently shipping a short gallery.
  const { count: cloudCount } = await supabase
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', galleryDbId)
  const expected = currentFilenames.length
  const uploaded = cloudCount ?? 0

  log('update-images:done', `${expected} expected, ${uploaded} in cloud, ${removed.length} removed, ${failures.length} failures`)
  return { error: null, failures, uploaded, expected }
}

// ─── Update Gallery Sections in Cloud ───────────────────────────────────────
// Used by the "Update Changes" button on a gallery that's already live.
// Re-creates the gallery_sections rows for the gallery and reassigns each
// image's section_id by filename. The image rows themselves and their storage
// objects are not touched.
export async function updateGallerySectionsInCloud(
  galleryDbIdOrLocalId: string,
  sections: PublishSectionInput[],
): Promise<{ error: string | null }> {
  // Resolve gallery DB id (UUID or local_id)
  let galleryDbId = galleryDbIdOrLocalId
  const isUuid = /^[0-9a-f]{8}-/.test(galleryDbId)
  if (!isUuid) {
    const { data } = await supabase.from('galleries').select('id').eq('local_id', galleryDbId).maybeSingle()
    if (!data) return { error: 'Gallery not found in cloud' }
    galleryDbId = data.id
  }

  log('update-sections:start', `${sections.length} sections`)

  // 1. Wipe existing sections (cascade is OK because images.section_id is
  //    ON DELETE SET NULL, so deleting sections clears the FK without
  //    deleting the images themselves).
  const { error: delErr } = await supabase
    .from('gallery_sections')
    .delete()
    .eq('gallery_id', galleryDbId)
  if (delErr) return { error: `Delete old sections failed: ${delErr.message}` }

  // 2. Insert new sections
  const sectionPathToDbId = new Map<string, string>()
  if (sections.length > 0) {
    const sectionRows = sections.map(s => ({
      gallery_id: galleryDbId,
      name: s.name,
      sort_order: s.sortOrder,
    }))
    const { data: insertedSections, error: insErr } = await supabase
      .from('gallery_sections')
      .insert(sectionRows)
      .select('id, name, sort_order')
    if (insErr || !insertedSections) {
      return { error: `Insert sections failed: ${insErr?.message}` }
    }
    for (const inputSection of sections) {
      const matched = insertedSections.find(r => r.sort_order === inputSection.sortOrder && r.name === inputSection.name)
      if (!matched) continue
      for (const p of inputSection.imagePaths) {
        sectionPathToDbId.set(p, matched.id)
      }
    }
  }

  // 3. Reassign section_id on each image by filename. Filename is unique
  //    within a gallery (enforced by the upload pipeline using basename).
  //    CRITICAL: cloud stores sanitized filenames (Hebrew/spaces/specials are
  //    stripped on upload), so we must sanitize here too — otherwise files
  //    with non-ASCII names silently lose their section_id.
  const filenameToSection = new Map<string, string | null>()
  for (const [path, sectionId] of sectionPathToDbId) {
    const rawFilename = path.split('/').pop() || path
    filenameToSection.set(sanitizeFilename(rawFilename), sectionId)
  }

  // Pull all current images for the gallery so we can clear stragglers too.
  const { data: galleryImages } = await supabase
    .from('images')
    .select('id, filename')
    .eq('gallery_id', galleryDbId)

  if (galleryImages) {
    await Promise.all(galleryImages.map(async (img) => {
      const newSection = filenameToSection.get(img.filename) ?? null
      const { error: upErr } = await supabase
        .from('images')
        .update({ section_id: newSection })
        .eq('id', img.id)
      if (upErr) {
        log('update-sections:image-error', `${img.filename}: ${upErr.message}`)
      }
    }))
  }

  log('update-sections:done', `${sections.length} sections`)
  return { error: null }
}

// ─── Resolve cloud client id for a local client ────────────────────────────
// Returns the Supabase UUID of the `clients` row matching this business +
// local client id, or null if no gallery has ever been published for that
// client (in which case no cloud row exists yet).
export async function fetchCloudClientId(localClientId: string): Promise<string | null> {
  const businessId = requireBusinessId()
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('business_id', businessId)
    .eq('local_id', localClientId)
    .maybeSingle()
  if (error || !data) return null
  return data.id
}

/** URL for the client zone dashboard on the gallery web host. */
export function buildClientPageUrl(cloudClientId: string): string {
  const businessSlug = requireBusiness().slug
  return `${GALLERY_BASE}/${businessSlug}/client/${cloudClientId}/dashboard`
}

// ─── Update Gallery Settings (unchanged) ────────────────────────────────────

export async function updateGallerySettings(
  localGalleryId: string,
  deliverySettings: Record<string, unknown>
): Promise<{ error: string | null }> {
  log('update-settings:start', `local_id=${localGalleryId}`)

  const { data: existing, error: findError } = await supabase
    .from('galleries')
    .select('id, local_id, status')
    .eq('local_id', localGalleryId)
    .eq('status', 'live')

  if (!existing || existing.length === 0) {
    return { error: findError?.message || `No live gallery found with local_id=${localGalleryId}` }
  }

  // Strip plaintext password before persisting; route it through the
  // bcrypt-backed RPC so it never lands in the anon-readable JSONB.
  const sanitizedSettings = { ...deliverySettings }
  const plaintextPassword =
    typeof sanitizedSettings.password === 'string' && sanitizedSettings.password.length > 0
      ? sanitizedSettings.password
      : null
  delete sanitizedSettings.password

  const row = Array.isArray(existing) ? existing[0] : existing
  const galleryId = (row as { id?: string } | null)?.id

  // Mirror face_index_enabled onto the dedicated column so the rekognition
  // edge function (which only checks the column, not delivery_settings) sees
  // the new state. Toggling off for a live gallery just flips the flag; the
  // collection is kept so re-enabling later doesn't have to re-process every
  // photo. Toggling on kicks off resumeFaceIndexingIfEnabled below.
  const desiredFaceEnabled = !!sanitizedSettings.faceIndexEnabled

  const { error: updateError } = await supabase
    .from('galleries')
    .update({
      delivery_settings: sanitizedSettings,
      face_index_enabled: desiredFaceEnabled,
    })
    .eq('local_id', localGalleryId)
    .eq('status', 'live')
    .select('id')

  if (updateError) {
    return { error: `${updateError.code}: ${updateError.message}` }
  }

  if (galleryId) {
    // Always call the RPC: when the photographer toggles back to "Public"
    // we want to clear any previously-stored hash. plaintextPassword === null
    // means clear.
    const { error: pwErr } = await supabase.rpc('set_gallery_password', {
      p_gallery_id: galleryId,
      p_password: plaintextPassword,
    })
    if (pwErr) return { error: `password update failed: ${pwErr.message}` }

    // If face search just got turned on, start indexing now so the user
    // doesn't have to wait for a full publish cycle. Safe to call when
    // already running (the edge function rejects concurrent claims).
    if (desiredFaceEnabled) {
      try {
        await startFaceIndexingInBackground(galleryId)
      } catch (err) {
        log('update-settings:face-start-error', err instanceof Error ? err.message : String(err))
      }
    }
  }

  return { error: null }
}
