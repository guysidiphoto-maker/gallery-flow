// Per-collection run engine: jszip holds the whole archive in memory, so entries are
// extracted, hashed and uploaded (existing uploadMany pipeline) in small checkpointed chunks.
import { insertGalleryWithSlug } from '@/shared/data/galleries'
import { uploadMany } from '@/features/dashboard/lib/uploadPipeline'
import { sha256HexBrowser, ZIP_ENTRY_MAX_BYTES } from './zipRules'
import type { PriorFileStatus } from './resumePlan'
import {
  reportCollectionProgress,
  type CollectionStatus, type ImportCollection, type OwnerBusiness, type ZipListing,
} from './importApi'

// ── Gallery creation (same insert shape as the dashboard's new-gallery flow) ──

async function createImportGallery(args: {
  businessId: string
  name: string
  clientId: string | null
  importSource: { provider: string; url: string | null; jobId: string }
  eventDate?: string | null
}): Promise<{ id: string; slug: string | null } | null> {
  const { data, error } = await insertGalleryWithSlug({
    name: args.name,
    business_id: args.businessId,
    status: 'draft',
    image_count: 0,
    client_id: args.clientId,
    delivery_settings: {
      accessType: 'public',
      password: null,
      downloadsEnabled: true,
      bulkDownloadEnabled: false,
      downloadQuality: 'web',
      studioName: '',
      logoUrl: null,
      showFooterCredit: true,
      galleryTitle: args.name,
      clientName: '',
      coverImageId: null,
      coverImageUrl: null,
      coverCrop: null,
      galleryDescription: '',
      eventDate: args.eventDate ?? '',
      eventLocation: '',
      eventType: '',
      clientSelectionEnabled: false,
      clientCode: '',
      layoutMode: '2-col',
      imageSpacing: 'small',
      cornerStyle: 'rounded',
      generateStories: false,
      showStories: true,
      welcomeStyle: 'mosaic',
      clientHidePhotosEnabled: false,
      requireGalleryCode: false,
      galleryCode: '',
      trackDownloads: false,
      feedLayout: 'grid',
      importSource: args.importSource,
    },
  })
  if (error || !data) return null
  return { id: data.id as string, slug: (data.slug as string | null) ?? null }
}

// ── Run engine ───────────────────────────────────────────────────────────────

// Status reports throw on network errors; none of them may abort the import itself.
async function reportBestEffort(args: Parameters<typeof reportCollectionProgress>[0]) {
  try { await reportCollectionProgress(args) } catch { /* the next checkpoint retries */ }
}

const CHUNK_SIZE = 8            // files extracted+uploaded per chunk (memory bound)
const UPLOAD_CONCURRENCY = 4    // within a chunk

export interface RunControls {
  isPaused: () => boolean
  isCancelled: () => boolean
}

export interface CollectionProgress {
  uploaded: number
  skippedDuplicate: number
  failed: number
  total: number
  currentFile?: string
}

export interface CollectionRunResult {
  galleryId: string | null
  uploaded: number
  skippedDuplicate: number
  failed: number
  failures: Array<{ filename: string; error: string }>
  stopped: 'paused' | 'cancelled' | null
}

/**
 * Import one collection in checkpointed chunks so a pause resumes where it stopped.
 * Files whose hash was already seen in this job are recorded skipped_duplicate, never re-uploaded.
 * `priorFiles` lists files a previous run already handled; it is updated as files are
 * handled so the caller's copy stays right even when a checkpoint report is lost.
 */
export async function runCollection(args: {
  jobId: string
  collection: ImportCollection
  listing: ZipListing
  business: OwnerBusiness
  clientId: string | null
  priorFiles: Map<string, PriorFileStatus>
  knownHashes: Set<string>
  controls: RunControls
  onProgress: (p: CollectionProgress) => void
  /** Called as soon as the target gallery exists, so a resume reuses it. */
  onGalleryReady?: (galleryId: string) => void
}): Promise<CollectionRunResult> {
  const { jobId, collection, listing, business, controls, onProgress } = args
  const accepted = listing.summary.accepted
  const total = accepted.length
  let uploaded = 0, skippedDuplicate = 0, failed = 0
  const failures: Array<{ filename: string; error: string }> = []

  // 1) Ensure target gallery (idempotent on resume).
  let galleryId = collection.target_gallery_id
  if (!galleryId) {
    const g = await createImportGallery({
      businessId: business.id,
      name: collection.source_name,
      clientId: args.clientId,
      importSource: { provider: 'pixieset', url: collection.source_url, jobId },
      eventDate: typeof collection.stats?.event_date === 'string' ? collection.stats.event_date : null,
    })
    if (!g) {
      await reportBestEffort({
        jobId, collectionId: collection.id, collectionStatus: 'failed',
        stats: { error: 'gallery_create_failed' },
      })
      return { galleryId: null, uploaded, skippedDuplicate, failed: total, failures: [{ filename: '*', error: 'gallery_create_failed' }], stopped: null }
    }
    galleryId = g.id
  }
  args.onGalleryReady?.(galleryId)
  await reportBestEffort({
    jobId, collectionId: collection.id, collectionStatus: 'importing', targetGalleryId: galleryId,
  })

  const report = () => onProgress({ uploaded, skippedDuplicate, failed, total })

  // 2) Chunked extract → hash → dedupe → upload → checkpoint.
  let sortOffset = [...args.priorFiles.values()].filter(s => s === 'uploaded').length
  for (let i = 0; i < accepted.length; i += CHUNK_SIZE) {
    if (controls.isCancelled()) return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: 'cancelled' }
    if (controls.isPaused()) return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: 'paused' }

    const chunk = accepted.slice(i, i + CHUNK_SIZE)
    const toUpload: File[] = []
    const fileRecords: Array<{ filename: string; sizeBytes?: number; contentHash?: string | null; status: string; error?: string | null }> = []

    for (const entry of chunk) {
      onProgress({ uploaded, skippedDuplicate, failed, total, currentFile: entry.filename })
      // Resume: handled in a previous run → count once, don't re-record.
      const prior = args.priorFiles.get(entry.filename)
      if (prior === 'uploaded') { uploaded++; continue }
      if (prior === 'skipped_duplicate') { skippedDuplicate++; continue }
      const zipObj = listing.zip.file(entry.path)
      if (!zipObj) {
        failed++; failures.push({ filename: entry.filename, error: 'missing_in_zip' })
        fileRecords.push({ filename: entry.filename, status: 'failed', error: 'missing_in_zip' })
        continue
      }
      let bytes: Uint8Array
      try {
        bytes = await zipObj.async('uint8array')
      } catch {
        failed++; failures.push({ filename: entry.filename, error: 'extract_failed' })
        fileRecords.push({ filename: entry.filename, status: 'failed', error: 'extract_failed' })
        continue
      }
      // Defense in depth: re-check the REAL size (metadata could be absent/lied).
      if (bytes.byteLength > ZIP_ENTRY_MAX_BYTES || bytes.byteLength === 0) {
        failed++; failures.push({ filename: entry.filename, error: 'invalid_size' })
        fileRecords.push({ filename: entry.filename, sizeBytes: bytes.byteLength, status: 'failed', error: 'invalid_size' })
        continue
      }
      const hash = await sha256HexBrowser(bytes)
      if (args.knownHashes.has(hash)) {
        skippedDuplicate++
        args.priorFiles.set(entry.filename, 'skipped_duplicate')
        fileRecords.push({ filename: entry.filename, sizeBytes: bytes.byteLength, contentHash: hash, status: 'skipped_duplicate' })
        continue
      }
      args.knownHashes.add(hash)
      const blobPart = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const f = new File([blobPart], entry.filename, { type: entry.mime })
      ;(f as unknown as { __hash: string }).__hash = hash
      toUpload.push(f)
    }

    if (toUpload.length > 0) {
      const { ok, failed: uploadFailed } = await uploadMany(
        toUpload,
        { galleryId, businessSlug: business.slug, sortOrder: sortOffset },
        () => report(),
        UPLOAD_CONCURRENCY,
      )
      sortOffset += toUpload.length
      for (const r of ok) {
        uploaded++
        args.priorFiles.set(r.filename, 'uploaded')
        const src = toUpload.find(f => f.name === r.filename)
        fileRecords.push({
          filename: r.filename, sizeBytes: r.originalSize,
          contentHash: src ? (src as unknown as { __hash?: string }).__hash ?? null : null,
          status: 'uploaded',
        })
      }
      for (const fRes of uploadFailed) {
        failed++
        failures.push({ filename: fRes.file.name, error: fRes.error })
        fileRecords.push({ filename: fRes.file.name, status: 'failed', error: fRes.error })
      }
    }

    report()
    await reportBestEffort({
      jobId, collectionId: collection.id,
      stats: { uploaded, skipped_duplicate: skippedDuplicate, failed, total },
      files: fileRecords,
    })
  }

  // 3) Final collection status.
  const finalStatus: CollectionStatus = failed > 0 && uploaded === 0 ? 'failed' : 'imported'
  await reportBestEffort({
    jobId, collectionId: collection.id, collectionStatus: finalStatus,
    stats: { uploaded, skipped_duplicate: skippedDuplicate, failed, total },
  })
  return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: null }
}
