import { supabase } from './supabase'
import * as tus from 'tus-js-client'

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const STANDARD_UPLOAD_LIMIT = 19 * 1024 * 1024 // 19MB — safety margin under 20MB server limit
const TUS_CHUNK_SIZE = 6 * 1024 * 1024          // 6MB chunks for resumable upload
const BUCKET = 'gallery-images'
const STORY_BUCKET = 'gallery-stories'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImageUploadStatus {
  filename: string
  originalUploaded: boolean
  webUploaded: boolean
  thumbUploaded: boolean
  failed: boolean
  failReason?: string
}

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
  // For anon access, fall back to the anon key embedded in the client
  return data.session?.access_token
    ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'
}

/**
 * Upload a file to Supabase Storage using the TUS resumable protocol.
 * Works for any file size — uploads in 6MB chunks with automatic resume.
 */
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

/** Standard upload for files ≤ 19MB */
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

/** Upload a file — picks standard or TUS based on size */
async function uploadFile(
  bucket: string,
  storagePath: string,
  data: ArrayBuffer,
  contentType: string,
  token: string
): Promise<{ error: string | null }> {
  try {
    if (data.byteLength <= STANDARD_UPLOAD_LIMIT) {
      return await standardUpload(bucket, storagePath, data, contentType)
    }
    // Large file → TUS resumable upload
    const blob = new Blob([data], { type: contentType })
    await tusUpload(bucket, storagePath, blob, contentType, token)
    return { error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}

// ─── Main Upload Function ────────────────────────────────────────────────────

export async function uploadGalleryToCloud(
  galleryName: string,
  clientName: string | null,
  clientLocalId: string | null,
  localGalleryId: string,
  imagePaths: string[],
  topPickIds: Set<string>,
  deliverySettings: Record<string, unknown>,
  onProgress: (progress: UploadProgress) => void
): Promise<CloudGallery & { result: PublishResult }> {

  const result: PublishResult = {
    totalImages: imagePaths.length,
    originalsUploaded: 0,
    webCopiesUploaded: 0,
    thumbsUploaded: 0,
    failedFiles: [],
  }

  const report = (uploaded: number, total: number, currentFile: string, phase: UploadProgress['phase']) => {
    onProgress({ uploaded, total, currentFile, phase, result: { ...result } })
  }

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
  const total = imagePaths.length
  const token = await getSupabaseToken()

  // 3. Upload originals (one at a time — standard or TUS based on size)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`
    const originalPath = `${galleryId}/originals/${filename}`

    report(i, total, filename, 'originals')

    const buffer = await window.api.readFileBuffer(imgPath)
    if (!buffer) {
      result.failedFiles.push({ filename, reason: 'Could not read source file' })
      continue
    }

    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'heic' || ext === 'heif' ? 'image/heic'
      : 'image/jpeg'

    const { error } = await uploadFile(BUCKET, originalPath, buffer, mimeType, token)
    if (error) {
      result.failedFiles.push({ filename, reason: `Original upload failed: ${error}` })
      continue
    }

    result.originalsUploaded++
  }

  // 4. Upload web-optimized copies (always small — standard upload)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`

    // Skip if original already failed to read
    if (result.failedFiles.some(f => f.filename === filename)) continue

    report(i, total, filename, 'web')

    const compressed = await window.api.compressImageForUpload(imgPath)
    if (!compressed) {
      result.failedFiles.push({ filename, reason: 'Compression failed' })
      continue
    }

    const webPath = `${galleryId}/web/${filename}`
    const webBlob = new Blob([compressed.web], { type: 'image/jpeg' })
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(webPath, webBlob, { contentType: 'image/jpeg', upsert: true })

    if (error) {
      result.failedFiles.push({ filename, reason: `Web copy upload failed: ${error.message}` })
      continue
    }

    result.webCopiesUploaded++
  }

  // 5. Upload thumbnails (always small — standard upload)
  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i]
    const filename = imgPath.split('/').pop() || `img_${i}`

    if (result.failedFiles.some(f => f.filename === filename)) continue

    report(i, total, filename, 'thumbnails')

    const compressed = await window.api.compressImageForUpload(imgPath)
    if (!compressed) continue // already tracked in web phase

    const thumbPath = `${galleryId}/thumbs/${filename}`
    const thumbBlob = new Blob([compressed.thumb], { type: 'image/jpeg' })
    await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: true })

    result.thumbsUploaded++
  }

  report(total, total, '', 'finalizing')

  // 6. Fail the entire publish if any source image failed
  if (result.failedFiles.length > 0) {
    // Clean up gallery record — don't leave a half-published gallery
    await supabase.from('galleries').update({ status: 'failed' }).eq('id', galleryId)
    const failedNames = result.failedFiles.map(f => f.filename).join(', ')
    const reasons = result.failedFiles.map(f => `${f.filename}: ${f.reason}`).join('\n')
    throw new Error(
      `Publish incomplete — ${result.failedFiles.length} image(s) failed:\n${reasons}\n\nFailed: ${failedNames}`
    )
  }

  // 7. Insert image records (only after ALL uploads succeeded)
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
        original_path: `${galleryId}/originals/${filename}`,
        thumbnail_path: `${galleryId}/thumbs/${filename}`,
        is_top_pick: isTopPick,
        sort_order: i,
      })
  }

  // 8. Generate public URL & mark live
  const publicUrl = `https://vlyiqfawkrjvqcmkpfvs.supabase.co/gallery/${galleryId}`

  await supabase
    .from('galleries')
    .update({ status: 'live', public_url: publicUrl, published_at: new Date().toISOString() })
    .eq('id', galleryId)

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
      // Large story → TUS resumable upload
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

  return { skipped: false }
}
