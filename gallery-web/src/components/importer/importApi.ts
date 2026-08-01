// importApi.ts — data layer + run engine for the Import Center wizard.
//
// READS  → supabase directly (owner RLS: own business, own clients, own jobs).
// WRITES → POST /api/import-center via authedFetch (service-role, audited).
// PHOTOS → the EXISTING upload pipeline (uploadPipeline.uploadMany). This module
//          never invents a storage path or a new upload mechanism.
//
// ZIP reading uses jszip 3.10.1 (already a dependency). jszip is NOT a
// streaming unzipper: the archive is held in memory, so ZIPs are capped at
// 2GB (ZIP_FILE_MAX_BYTES) with an honest error message. Extraction happens in
// small chunks (CHUNK_SIZE files at a time) so photo bytes are released to GC
// between chunks instead of expanding the whole archive at once.

import JSZip from 'jszip'
import { supabase } from '../../supabase'
import { authedFetch } from '../../lib/authedFetch'
import { uploadMany } from '../../lib/uploadPipeline'
import {
  summarizeZipEntries, sha256HexBrowser, ZIP_FILE_MAX_BYTES, ZIP_ENTRY_MAX_BYTES,
  type ZipEntryMeta, type ZipSummary,
} from './zipRules'

// ── API types ────────────────────────────────────────────────────────────────

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'create_new' | 'skip'
export type CollectionStatus = 'pending' | 'importing' | 'imported' | 'skipped' | 'failed'
export type JobStatus =
  | 'draft' | 'dry_run' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface ImportCollection {
  id: string
  source_name: string
  source_url: string | null
  matched_client_id: string | null
  client_match_status: MatchStatus
  target_gallery_id: string | null
  status: CollectionStatus
  stats: Record<string, unknown>
}

export interface ImportFileRow {
  collection_id: string
  filename: string
  status: 'pending' | 'uploaded' | 'skipped_duplicate' | 'failed'
  content_hash: string | null
  size_bytes: number | null
  error: string | null
}

export interface DryRunResult {
  ok: boolean
  error?: string
  kind?: 'contacts' | 'collections'
  status?: JobStatus
  collections?: ImportCollection[]
  contacts?: Array<{ firstName: string; lastName: string; email: string | null; company: string | null }>
  contact_count?: number
  dropped_password_columns?: string[]
  ignored_headers?: string[]
  totals?: Record<string, number>
}

export interface ClientOption { id: string; name: string }

// ── API calls ────────────────────────────────────────────────────────────────

async function callImport<T = Record<string, unknown>>(
  action: string, body: Record<string, unknown> = {},
): Promise<T & { ok: boolean; error?: string }> {
  const res = await authedFetch('/api/import-center', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  return res.json() as Promise<T & { ok: boolean; error?: string }>
}

export async function createJob(provider: string, kind: string, label?: string) {
  return callImport<{ job_id: string }>('create_job', { provider, kind, label })
}

export async function parseCsvDryRun(jobId: string, csvText: string, kind?: string): Promise<DryRunResult> {
  return callImport<DryRunResult>('parse_csv', { jobId, csvText, kind })
}

export async function setCollectionMapping(
  collectionId: string, mappingAction: 'map' | 'create_new' | 'skip', clientId?: string,
) {
  return callImport('set_collection_mapping', { collectionId, mappingAction, clientId })
}

export async function startJob(jobId: string, estimate?: { files: number; bytes: number }) {
  return callImport<{ status: JobStatus }>('start_job', { jobId, estimate })
}

export async function pauseJob(jobId: string) { return callImport('pause_job', { jobId }) }
export async function resumeJob(jobId: string) { return callImport<{ status: JobStatus }>('resume_job', { jobId }) }
export async function cancelJob(jobId: string) { return callImport('cancel_job', { jobId }) }
export async function retryFailed(jobId: string) { return callImport('retry_failed', { jobId }) }

export async function jobStatus(jobId: string, includeFiles = false) {
  return callImport<{
    job: { id: string; status: JobStatus; totals: Record<string, number>; checkpoint: Record<string, unknown> }
    collections: ImportCollection[]
    files: ImportFileRow[]
  }>('job_status', { jobId, includeFiles })
}

export async function reportCollectionProgress(args: {
  jobId: string
  collectionId: string
  collectionStatus?: CollectionStatus
  stats?: Record<string, unknown>
  targetGalleryId?: string
  files?: Array<{ filename: string; sizeBytes?: number; contentHash?: string | null; status: string; error?: string | null }>
}) {
  return callImport<{ job_status: JobStatus }>('update_collection_progress', { ...args })
}

/** Inline client creation reuses the existing client-admin surface (contract C3). */
export async function createClientInline(name: string): Promise<string | null> {
  const res = await authedFetch('/api/client-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_client', name }),
  })
  const json = await res.json() as { ok: boolean; client_id?: string }
  return json.ok && json.client_id ? json.client_id : null
}

// ── Owner reads (RLS-scoped) ────────────────────────────────────────────────

export interface OwnerBusiness { id: string; slug: string }

export async function loadOwnerBusiness(): Promise<OwnerBusiness | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return null
  const { data } = await supabase.from('businesses')
    .select('id, slug').eq('user_id', uid).maybeSingle()
  return data ? { id: data.id as string, slug: String(data.slug ?? '') } : null
}

export async function loadClientOptions(businessId: string): Promise<ClientOption[]> {
  const { data } = await supabase.from('clients')
    .select('id, name').eq('business_id', businessId).order('name').limit(2000)
  return (data ?? []).map(r => ({ id: r.id as string, name: String(r.name ?? '') }))
}

// ── ZIP listing (client-side, jszip) ────────────────────────────────────────

export interface ZipListing {
  zip: JSZip
  entries: ZipEntryMeta[]
  summary: ZipSummary
}

export async function listZipEntries(file: File): Promise<ZipListing> {
  if (file.size > ZIP_FILE_MAX_BYTES) throw new Error('zip_too_large')
  const zip = await JSZip.loadAsync(file)
  const entries: ZipEntryMeta[] = []
  zip.forEach((path, obj) => {
    // jszip does not expose sizes publicly; _data carries them after loadAsync.
    // Fall back to 1/1 (passes the metadata gate) — the post-extraction size
    // guard in runCollection re-enforces the 40MB cap on actual bytes.
    const data = (obj as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data
    entries.push({
      path,
      isDirectory: obj.dir,
      uncompressedSize: typeof data?.uncompressedSize === 'number' && data.uncompressedSize >= 0 ? data.uncompressedSize : 1,
      compressedSize: typeof data?.compressedSize === 'number' && data.compressedSize > 0 ? data.compressedSize : 1,
    })
  })
  return { zip, entries, summary: summarizeZipEntries(entries) }
}

// ── Gallery creation (mirrors Dashboard.tsx new-gallery insert shape) ───────

export async function createImportGallery(args: {
  businessId: string
  name: string
  clientId: string | null
  importSource: { provider: string; url: string | null; jobId: string }
  eventDate?: string | null
}): Promise<{ id: string; slug: string | null } | null> {
  const { data, error } = await supabase.from('galleries').insert({
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
      // Provenance (contract C7): where this gallery came from.
      importSource: args.importSource,
    },
  }).select('id, slug').maybeSingle()
  if (error || !data) return null
  return { id: data.id as string, slug: (data.slug as string | null) ?? null }
}

// ── Run engine ───────────────────────────────────────────────────────────────

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
 * Import ONE collection: ensure the target gallery exists, then stream the
 * accepted ZIP entries through uploadMany in small chunks, checkpointing every
 * chunk via the API so a refresh/pause resumes exactly where it stopped.
 *
 * Duplicate policy: 'skip' (implemented). A file whose sha256 content hash was
 * already uploaded within this JOB, or whose sanitized filename is already
 * recorded 'uploaded' for this collection (resume), is skipped and recorded as
 * skipped_duplicate — never re-uploaded, never deleted.
 */
export async function runCollection(args: {
  jobId: string
  collection: ImportCollection
  listing: ZipListing
  business: OwnerBusiness
  clientId: string | null
  alreadyUploadedNames: Set<string>
  knownHashes: Set<string>
  controls: RunControls
  onProgress: (p: CollectionProgress) => void
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
      await reportCollectionProgress({
        jobId, collectionId: collection.id, collectionStatus: 'failed',
        stats: { error: 'gallery_create_failed' },
      })
      return { galleryId: null, uploaded, skippedDuplicate, failed: total, failures: [{ filename: '*', error: 'gallery_create_failed' }], stopped: null }
    }
    galleryId = g.id
  }
  await reportCollectionProgress({
    jobId, collectionId: collection.id, collectionStatus: 'importing', targetGalleryId: galleryId,
  })

  const report = () => onProgress({ uploaded, skippedDuplicate, failed, total })

  // 2) Chunked extract → hash → dedupe → upload → checkpoint.
  let sortOffset = 0
  for (let i = 0; i < accepted.length; i += CHUNK_SIZE) {
    if (controls.isCancelled()) return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: 'cancelled' }
    if (controls.isPaused()) return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: 'paused' }

    const chunk = accepted.slice(i, i + CHUNK_SIZE)
    const toUpload: File[] = []
    const fileRecords: Array<{ filename: string; sizeBytes?: number; contentHash?: string | null; status: string; error?: string | null }> = []

    for (const entry of chunk) {
      onProgress({ uploaded, skippedDuplicate, failed, total, currentFile: entry.filename })
      // Resume: already uploaded in a previous run → count once, don't re-record.
      if (args.alreadyUploadedNames.has(entry.filename)) { uploaded++; continue }
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
    // Checkpoint this chunk (bookkeeping + resume point). Best effort — a
    // checkpoint failure must not kill the run.
    try {
      await reportCollectionProgress({
        jobId, collectionId: collection.id,
        stats: { uploaded, skipped_duplicate: skippedDuplicate, failed, total },
        files: fileRecords,
      })
    } catch { /* checkpoint is best-effort */ }
  }

  // 3) Final collection status.
  const finalStatus: CollectionStatus = failed > 0 && uploaded === 0 ? 'failed' : 'imported'
  await reportCollectionProgress({
    jobId, collectionId: collection.id, collectionStatus: finalStatus,
    stats: { uploaded, skipped_duplicate: skippedDuplicate, failed, total },
  })
  return { galleryId, uploaded, skippedDuplicate, failed, failures, stopped: null }
}
