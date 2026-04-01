import { supabase } from './supabase'
import * as tus from 'tus-js-client'

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const STANDARD_UPLOAD_LIMIT = 19 * 1024 * 1024 // 19MB — safety margin under 20MB server limit
const TUS_CHUNK_SIZE = 6 * 1024 * 1024          // 6MB chunks for resumable upload
const BUCKET = 'gallery-images'
const STORY_BUCKET = 'gallery-stories'
const MAX_RETRIES = 2                            // auto-retry failed uploads

// ─── Debug Logger ────────────────────────────────────────────────────────────

function log(step: string, detail?: string | number) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[publish ${ts}] ${step}${detail != null ? ` — ${detail}` : ''}`)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PublishResult {
  totalImages: number
  originalsUploaded: number
  webCopiesUploaded: number
  thumbsUploaded: number
  failedFiles: Array<{ filename: string; reason: string }>
}

export interface UploadProgress {
  uploaded: number
  total: number
  percent: number
  currentFile?: string
  phase?: 'originals' | 'web' | 'thumbnails' | 'finalizing'
  result: PublishResult
}

interface CloudGallery {
  id: string
  publicUrl: string
}

// ─── TUS Resumable Upload ────────────────────────────────────────────────────

async function getSupabaseToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
    ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'
}

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

// ─── Upload Helpers ──────────────────────────────────────────────────────────

async function standardUpload(
  bucket: string,
  storagePath: string,
  data: ArrayBuffer | Blob,
  contentType: string
): Promise<{ error: string | null }> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: contentType })
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, { contentType, upsert: true })
  return { error: error?.message ?? null }
}

async function uploadFile(
  bucket: string,
  storagePath: string,
  data: ArrayBuffer,
  contentType: string,
  token: string
): Promise<{ error: string | null }> {
  try {
    if (data.byteLength <= STANDARD_UPLOAD_LIMIT) {
      log('upload:standard', `${storagePath} (${(data.byteLength / 1024).toFixed(0)}KB)`)
      return await standardUpload(bucket, storagePath, data, contentType)
    }
    log('upload:tus', `${storagePath} (${(data.byteLength / 1024 / 1024).toFixed(1)}MB)`)
    const blob = new Blob([data], { type: contentType })
    await tusUpload(bucket, storagePath, blob, contentType, token)
    return { error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}

/** Upload with automatic retry on failure */
async function uploadFileWithRetry(
  bucket: string,
  storagePath: string,
  data: ArrayBuffer,
  contentType: string,
  token: string
): Promise<{ error: string | null }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await uploadFile(bucket, storagePath, data, contentType, token)
    if (!error) return { error: null }
    if (attempt < MAX_RETRIES) {
      log('retry', `${storagePath} attempt ${attempt + 2}/${MAX_RETRIES + 1}`)
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    } else {
      return { error }
    }
  }
  return { error: 'Max retries exceeded' }
}

/** Standard upload with auto-retry for small files */
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
    if (attempt < MAX_RETRIES) {
      log('retry', `${storagePath} attempt ${attempt + 2}/${MAX_RETRIES + 1}`)
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    } else {
      return { error: error.message }
    }
  }
  return { error: 'Max retries exceeded' }
}

// ─── Main Upload Function ────────────────────────────────────────────────────

export async function uploadGalleryToCloud(
  galleryName: string,
  clientName: string | null,
  clientLocalId: string | null,
  localGalleryId: string,
  imagePaths: string[],
  topPickIds: Set<string>,
  deliverySettings: Record<string, unknown> & { downloadQuality?: string },
  onProgress: (progress: UploadProgress) => void
): Promise<CloudGallery & { result: PublishResult }> {

  const result: PublishResult = {
    totalImages: imagePaths.length,
    originalsUploaded: 0,
    webCopiesUploaded: 0,
    thumbsUploaded: 0,
    failedFiles: [],
  }

  // Total steps = (originals? + web + thumbs) * imageCount
  const uploadOriginals = deliverySettings.downloadQuality === 'original'
  const totalSteps = imagePaths.length * (uploadOriginals ? 3 : 2)
  let completedSteps = 0

  const report = (currentFile: string, phase: UploadProgress['phase']) => {
    const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    onProgress({ uploaded: completedSteps, total: totalSteps, percent, currentFile, phase, result: { ...result } })
  }

  log('start', `${imagePaths.length} images, quality=${deliverySettings.downloadQuality || 'high'}`)

  // 1. Upsert client
  let clientDbId: string | null = null
  if (clientLocalId && clientName) {
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('local_id', clientLocalId)
      .single()

    if (existingClient) {
      clientDbId = existingClient.id
    } else {
      const { data: newClient } = await supabase
        .from('clients')
        .insert({ local_id: clientLocalId, name: clientName })
        .select('id')
        .single()
      if (newClient) clientDbId = newClient.id
    }
  }

  // 2. Create gallery record
  const { data: gallery, error: galleryError } = await supabase
    .from('galleries')
    .insert({
      local_id: localGalleryId,
      name: galleryName,
      client_id: clientDbId,
      client_name: clientName,
      status: 'publishing',
      image_count: imagePaths.length,
      delivery_settings: deliverySettings,
    })
    .select('id')
    .single()

  if (galleryError || !gallery) {
    throw new Error(`Failed to create gallery: ${galleryError?.message}`)
  }

  const galleryId = gallery.id
  const token = await getSupabaseToken()
  log('gallery-created', galleryId)

  // 3. Upload originals (only when downloadQuality is "original")
  if (uploadOriginals) {
    log('phase:originals', `${imagePaths.length} files`)
    for (let i = 0; i < imagePaths.length; i++) {
      const imgPath = imagePaths[i]
      const filename = imgPath.split('/').pop() || `img_${i}`
      const originalPath = `${galleryId}/originals/${filename}`

      report(filename, 'originals')

      const buffer = await window.api.readFileBuffer(imgPath)
      if (!buffer) {
        log('skip', `${filename} — could not read`)
        result.failedFiles.push({ filename, reason: 'Could not read source file' })
        completedSteps++
        continue
      }

      log('original', `${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`)

      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
      const mimeType = ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'heic' || ext === 'heif' ? 'image/heic'
        : 'image/jpeg'

      const { error } = await uploadFileWithRetry(BUCKET, originalPath, buffer, mimeType, token)
      if (error) {
        log('failed', `${filename} — ${error}`)
        result.failedFiles.push({ filename, reason: `Original upload failed: ${error}` })
      } else {
        result.originalsUploaded++
      }
      completedSteps++
    }
  }

  // 4. Upload web-optimized copies (always small — standard upload with retry)
  log('phase:web', `${imagePaths.length} files`)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`

    report(filename, 'web')

    const compressed = await window.api.compressImageForUpload(imgPath)
    if (!compressed) {
      log('skip', `${filename} — compression failed`)
      result.failedFiles.push({ filename, reason: 'Compression failed' })
      completedSteps++
      continue
    }

    log('compressed', `${filename} web=${(compressed.webSize / 1024).toFixed(0)}KB thumb=${(compressed.thumbSize / 1024).toFixed(0)}KB`)

    const webPath = `${galleryId}/web/${filename}`
    const webBlob = new Blob([compressed.web], { type: 'image/jpeg' })
    const { error } = await standardUploadWithRetry(BUCKET, webPath, webBlob, 'image/jpeg')

    if (error) {
      log('failed', `${filename} web — ${error}`)
      result.failedFiles.push({ filename, reason: `Web copy upload failed: ${error}` })
    } else {
      result.webCopiesUploaded++
    }
    completedSteps++
  }

  // 5. Upload thumbnails (always small — standard upload with retry)
  log('phase:thumbnails', `${imagePaths.length} files`)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`

    report(filename, 'thumbnails')

    const compressed = await window.api.compressImageForUpload(imgPath)
    if (!compressed) {
      completedSteps++
      continue
    }

    const thumbPath = `${galleryId}/thumbs/${filename}`
    const thumbBlob = new Blob([compressed.thumb], { type: 'image/jpeg' })
    const { error } = await standardUploadWithRetry(BUCKET, thumbPath, thumbBlob, 'image/jpeg')

    if (!error) {
      result.thumbsUploaded++
    } else {
      log('failed', `${filename} thumb — ${error}`)
    }
    completedSteps++
  }

  report('', 'finalizing')
  log('uploads-done', `originals=${result.originalsUploaded} web=${result.webCopiesUploaded} thumbs=${result.thumbsUploaded} failed=${result.failedFiles.length}`)

  // 6. Fail if critical images failed (web copy is required)
  const criticalFailures = result.failedFiles.filter(f =>
    f.reason.includes('Compression failed') || f.reason.includes('Web copy')
  )
  if (criticalFailures.length > 0) {
    await supabase.from('galleries').update({ status: 'failed' }).eq('id', galleryId)
    const reasons = criticalFailures.map(f => `${f.filename}: ${f.reason}`).join('\n')
    throw new Error(
      `Publish incomplete — ${criticalFailures.length} image(s) failed:\n${reasons}`
    )
  }

  // 7. Insert image records (only after uploads succeeded)
  log('inserting-records', imagePaths.length)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`
    const isTopPick = topPickIds.has(imgPath)

    await supabase
      .from('images')
      .insert({
        gallery_id: galleryId,
        filename,
        storage_path: `${galleryId}/web/${filename}`,
        original_path: uploadOriginals ? `${galleryId}/originals/${filename}` : null,
        thumbnail_path: `${galleryId}/thumbs/${filename}`,
        is_top_pick: isTopPick,
        sort_order: i,
      })
  }

  // 8. Generate public URL — gallery is NOT live yet, stories still pending
  const GALLERY_BASE = 'https://gallery-web-theta.vercel.app'
  const publicUrl = `${GALLERY_BASE}/gallery/${galleryId}`

  // Mark as live only after all uploads + records are done
  // Stories are handled by the caller — gallery goes live AFTER stories complete
  log('ready', publicUrl)

  return { id: galleryId, publicUrl, result }
}

// ─── Story Upload ────────────────────────────────────────────────────────────

export async function uploadStoryToCloud(
  galleryId: string,
  style: string,
  storyFilePath: string
): Promise<{ skipped: boolean; reason?: string }> {
  const fileSize = await window.api.getFileSize(storyFilePath)
  if (fileSize === null) {
    return { skipped: true, reason: 'Could not read story file' }
  }

  log('story', `${style} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`)

  const buffer = await window.api.readFileBuffer(storyFilePath)
  if (!buffer) return { skipped: true, reason: 'Could not read story file' }

  const storagePath = `${galleryId}/story_${style}.mp4`

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
    const msg = err instanceof Error ? err.message : String(err)
    return { skipped: true, reason: `Upload failed: ${msg}` }
  }

  await supabase
    .from('stories')
    .insert({
      gallery_id: galleryId,
      style,
      storage_path: storagePath,
    })

  log('story-done', style)
  return { skipped: false }
}

// ─── Mark Gallery Live ───────────────────────────────────────────────────────

/** Call this ONLY after all uploads + stories are complete */
export async function markGalleryLive(galleryId: string, publicUrl: string): Promise<void> {
  log('marking-live', galleryId)
  await supabase
    .from('galleries')
    .update({ status: 'live', public_url: publicUrl, published_at: new Date().toISOString() })
    .eq('id', galleryId)
}
