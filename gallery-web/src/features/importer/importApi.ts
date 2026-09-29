// Import Center data layer + run engine. Reads go to supabase (owner RLS); writes go to
// POST /api/import-center; photos go through the existing uploadMany pipeline.
// The per-collection run engine lives in runCollection.ts.

import JSZip from 'jszip'
import { supabase } from '@/shared/lib/supabase'
import { authedFetch } from '@/shared/lib/authedFetch'
import { getOwnerBusiness } from '@/shared/data/businesses'
import { summarizeZipEntries, ZIP_FILE_MAX_BYTES, type ZipEntryMeta, type ZipSummary } from './zipRules'

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

/** Inline client creation via the existing client-admin endpoint. */
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
  const { data } = await getOwnerBusiness(uid, 'id, slug')
  const row = data as { id: string; slug: string | null } | null
  return row ? { id: row.id, slug: String(row.slug ?? '') } : null
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
    // jszip keeps sizes on the private _data; fall back to 1/1 (passes the metadata gate)
    // since runCollection re-checks the real byte size after extraction.
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
