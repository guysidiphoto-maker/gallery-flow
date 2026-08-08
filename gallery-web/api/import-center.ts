// import-center.ts — owner-side Import Center write surface (contract C7).
// ONE multi-action endpoint (Vercel function-count discipline) orchestrating
// migrations from Pixieset/generic-CSV/local-folder into piXflow galleries.
//
// TRUTHFUL scope: there is NO Pixieset API and no scraping here. The owner
// exports CSVs + per-collection ZIPs from their own Pixieset account via the
// official UI; this endpoint only manages job state, dry-runs the CSV, and
// records per-file bookkeeping. Photos are uploaded by the BROWSER through the
// existing upload pipeline (uploadPipeline.ts) — no server storage path.
//
// Security contract (same as client-admin.ts, enforced for EVERY action):
//   1. valid Supabase JWT (Bearer)                    → requireOwnerBusiness
//   2. business resolved from auth.uid() (never body) → requireOwnerBusiness
//   3. target job/collection belongs to that business (re-checked per action)
//   4. writes via service-role only (tables have NO client write policies)
//   5. audited to client_access_audit (import_* actions, added in 097)
//   6. idempotent state transitions (start on running = no-op success)
//   7. CSV password-looking columns are DROPPED server-side, never stored
//
// cancel_job is SAFE: it marks the job cancelled; it NEVER deletes uploaded
// images or galleries.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import {
  requireOwnerBusiness, appendAudit, withinRateLimit, type AuditAction,
} from '../server/clientAdmin.js'
import {
  CSV_MAX_BYTES, parseCsv, detectCsvKind, mapCollectionsCsv, mapContactsCsv,
  matchClient, sanitizeImportFilename, transitionJob,
  type ClientCandidate, type JobStatus, type JobAction, type CsvKind,
} from '../server/importer.js'

export const maxDuration = 30

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

// import_* audit actions are added to the DB CHECK in migration 097 (owner:
// Agent-DB) and to the shared AuditAction TS union in wave 2. Until that merge,
// this local union + cast keeps the audit calls typed without editing
// server/clientAdmin.ts (owned by Agent-ASSIGN in this sprint).
type ImportAuditAction =
  | 'import_job_created' | 'import_job_started' | 'import_job_completed'
  | 'import_job_cancelled' | 'import_collection_imported'
const asAudit = (a: ImportAuditAction) => a as unknown as AuditAction

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const h = new URL(origin).hostname
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app') ||
      h === 'pixflow.co.il' || h.endsWith('.pixflow.co.il') ||
      h === 'pixflow-ai.com' || h.endsWith('.pixflow-ai.com') ||
      h === 'eclipsemedia.co.il' || h.endsWith('.eclipsemedia.co.il')
  } catch { return false }
}

type Json = Record<string, unknown>
const bad = (res: VercelResponse, status: number, code: string, extra?: Json) =>
  res.status(status).json({ ok: false, error: code, ...(extra ?? {}) })

const PROVIDERS = new Set(['pixieset', 'generic_csv', 'local_folder'])
const JOB_KINDS = new Set(['metadata_csv', 'photos_zip'])
const MAPPING_ACTIONS = new Set(['map', 'create_new', 'skip'])
const COLLECTION_STATUSES = new Set(['pending', 'importing', 'imported', 'skipped', 'failed'])
const FILE_STATUSES = new Set(['pending', 'uploaded', 'skipped_duplicate', 'failed'])
const MAX_FILES_PER_CALL = 500

interface JobRow {
  id: string; business_id: string; status: JobStatus; kind: string
  totals: Json; checkpoint: Json; started_at: string | null
}

async function loadJob(jobId: string, businessId: string): Promise<JobRow | null> {
  if (!jobId) return null
  const { data } = await supabase!.from('import_jobs')
    .select('id, business_id, status, kind, totals, checkpoint, started_at')
    .eq('id', jobId).eq('business_id', businessId).maybeSingle()
  return (data as JobRow | null) ?? null
}

/** Apply a state-machine action to a job row. Returns the effective status or
 *  an error string. Idempotent: no-op transitions succeed without a write. */
async function applyTransition(
  job: JobRow, action: JobAction, patch: Json = {},
): Promise<{ ok: true; status: JobStatus; noop: boolean } | { ok: false; error: string }> {
  const t = transitionJob(job.status, action)
  if (!t.ok) return { ok: false, error: `invalid_transition:${job.status}->${action}` }
  if (t.noop && Object.keys(patch).length === 0) return { ok: true, status: t.next, noop: true }
  const { error } = await supabase!.from('import_jobs')
    .update({ status: t.next, ...patch }).eq('id', job.id)
  if (error) return { ok: false, error: 'update_failed' }
  return { ok: true, status: t.next, noop: t.noop }
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { bad(res, 405, 'method_not_allowed'); return }
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) { bad(res, 403, 'forbidden_origin'); return }
  if (!supabase) { bad(res, 500, 'supabase_not_configured'); return }

  const body = (req.body ?? {}) as Json
  const action = String(body.action ?? '')

  const owner = await requireOwnerBusiness(req, supabase)
  if (!owner.ok) { bad(res, owner.status, owner.code); return }
  const businessId = owner.businessId
  const actorUserId = owner.userId

  try {
    switch (action) {
      // ── create_job ──────────────────────────────────────────────────────
      case 'create_job': {
        const provider = String(body.provider ?? 'pixieset')
        const kind = String(body.kind ?? 'photos_zip')
        const label = String(body.label ?? '').trim().slice(0, 120) || null
        if (!PROVIDERS.has(provider)) return void bad(res, 400, 'invalid_provider')
        if (!JOB_KINDS.has(kind)) return void bad(res, 400, 'invalid_kind')
        if (!(await withinRateLimit(supabase, businessId, asAudit('import_job_created'), 20, 60))) {
          return void bad(res, 429, 'rate_limited')
        }
        const { data: source, error: srcErr } = await supabase.from('import_sources')
          .insert({ business_id: businessId, provider, label }).select('id').maybeSingle()
        if (srcErr || !source) return void bad(res, 500, 'create_failed')
        const { data: job, error: jobErr } = await supabase.from('import_jobs')
          .insert({ business_id: businessId, source_id: source.id, kind, status: 'draft' })
          .select('id, status').maybeSingle()
        if (jobErr || !job) return void bad(res, 500, 'create_failed')
        await appendAudit(supabase, {
          businessId, actorType: 'owner', actorUserId,
          action: asAudit('import_job_created'), targetType: 'import_job', targetId: job.id as string,
          metadata: { provider, kind },
        })
        return void res.status(200).json({ ok: true, job_id: job.id, source_id: source.id, status: job.status })
      }

      // ── parse_csv (dry run) ─────────────────────────────────────────────
      case 'parse_csv': {
        const jobId = String(body.jobId ?? '')
        const csvText = typeof body.csvText === 'string' ? body.csvText : ''
        const kindHint = String(body.kind ?? 'auto')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')
        if (csvText.length === 0) return void bad(res, 400, 'csv_required')
        if (csvText.length > CSV_MAX_BYTES) return void bad(res, 400, 'csv_too_large')

        const parsed = parseCsv(csvText)
        if (!parsed.ok) return void bad(res, 400, parsed.error)
        const kind: CsvKind = kindHint === 'contacts' || kindHint === 'collections'
          ? kindHint : detectCsvKind(parsed.headers)
        if (kind === 'unknown') return void bad(res, 400, 'csv_kind_unrecognized')

        // Contacts CSV → reference report only (helps the owner create clients);
        // nothing stored. Password-looking columns are dropped and flagged.
        if (kind === 'contacts') {
          const mapped = mapContactsCsv(parsed.headers, parsed.rows)
          if (!mapped.ok) return void bad(res, 400, mapped.error ?? 'csv_unusable')
          return void res.status(200).json({
            ok: true, kind, job_id: jobId,
            contacts: mapped.rows.slice(0, 1000),
            contact_count: mapped.rows.length,
            dropped_password_columns: mapped.droppedPasswordColumns,
            ignored_headers: mapped.ignoredHeaders,
          })
        }

        // Collections CSV → dry run + import_collections rows (status pending).
        const t = transitionJob(job.status, 'parse_csv')
        if (!t.ok) return void bad(res, 409, 'invalid_transition', { from: job.status })
        const mapped = mapCollectionsCsv(parsed.headers, parsed.rows)
        if (!mapped.ok) return void bad(res, 400, mapped.error ?? 'csv_unusable')
        if (mapped.rows.length === 0) return void bad(res, 400, 'no_collections_found')

        // Client candidates: clients of this business + their membership emails.
        const { data: clientRows } = await supabase.from('clients')
          .select('id, name').eq('business_id', businessId).limit(2000)
        const { data: memberRows } = await supabase.from('client_memberships')
          .select('client_id, email').eq('business_id', businessId).limit(5000)
        const emailsByClient = new Map<string, string[]>()
        for (const m of memberRows ?? []) {
          const list = emailsByClient.get(m.client_id as string) ?? []
          list.push(String(m.email))
          emailsByClient.set(m.client_id as string, list)
        }
        const candidates: ClientCandidate[] = (clientRows ?? []).map(c => ({
          id: c.id as string, name: String(c.name ?? ''), emails: emailsByClient.get(c.id as string) ?? [],
        }))

        // Idempotent re-parse: replace this job's PENDING collections only
        // (already-imported ones are never touched).
        await supabase.from('import_collections')
          .delete().eq('job_id', jobId).eq('business_id', businessId).eq('status', 'pending')

        const inserts = mapped.rows.map(r => {
          const m = matchClient(r, candidates)
          return {
            job_id: jobId, business_id: businessId,
            source_name: r.sourceName, source_url: r.sourceUrl,
            matched_client_id: m.status === 'matched' ? m.clientId : null,
            client_match_status: m.status, status: 'pending',
            stats: { client_candidates: m.candidates, client_name: r.clientName, client_email: r.clientEmail, event_date: r.eventDate },
          }
        })
        const { data: created, error: insErr } = await supabase.from('import_collections')
          .insert(inserts).select('id, source_name, source_url, matched_client_id, client_match_status, status, stats')
        // Log the raw DB error server-side only; never leak it to the browser.
        if (insErr) { console.error('[import-center] dry_run insert failed', insErr); return void bad(res, 500, 'dry_run_failed') }

        const totals = {
          ...(job.totals ?? {}),
          collections: created?.length ?? 0,
          matched: inserts.filter(i => i.client_match_status === 'matched').length,
          ambiguous: inserts.filter(i => i.client_match_status === 'ambiguous').length,
          unmatched: inserts.filter(i => i.client_match_status === 'unmatched').length,
        }
        await supabase.from('import_jobs').update({ status: t.next, totals }).eq('id', jobId)

        return void res.status(200).json({
          ok: true, kind, job_id: jobId, status: t.next,
          collections: created ?? [],
          totals,
          dropped_password_columns: mapped.droppedPasswordColumns,
          ignored_headers: mapped.ignoredHeaders,
        })
      }

      // ── set_collection_mapping ──────────────────────────────────────────
      case 'set_collection_mapping': {
        const collectionId = String(body.collectionId ?? '')
        const mapping = String(body.mappingAction ?? body.actionType ?? '')
        const clientId = body.clientId ? String(body.clientId) : null
        if (!collectionId) return void bad(res, 400, 'collectionId_required')
        if (!MAPPING_ACTIONS.has(mapping)) return void bad(res, 400, 'invalid_mapping_action')
        const { data: col } = await supabase.from('import_collections')
          .select('id, business_id, job_id, status').eq('id', collectionId).eq('business_id', businessId).maybeSingle()
        if (!col) return void bad(res, 403, 'forbidden')
        if (col.status !== 'pending') return void bad(res, 409, 'collection_not_pending')

        let patch: Json
        if (mapping === 'map') {
          if (!clientId) return void bad(res, 400, 'clientId_required')
          const { data: client } = await supabase.from('clients')
            .select('id').eq('id', clientId).eq('business_id', businessId).maybeSingle()
          if (!client) return void bad(res, 403, 'client_forbidden')
          patch = { matched_client_id: clientId, client_match_status: 'matched' }
        } else if (mapping === 'create_new') {
          patch = { matched_client_id: null, client_match_status: 'create_new' }
        } else {
          patch = { matched_client_id: null, client_match_status: 'skip' }
        }
        const { error } = await supabase.from('import_collections').update(patch).eq('id', collectionId)
        if (error) return void bad(res, 500, 'mapping_failed')
        return void res.status(200).json({ ok: true, collection_id: collectionId, ...patch })
      }

      // ── start_job ───────────────────────────────────────────────────────
      case 'start_job': {
        const jobId = String(body.jobId ?? '')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')

        // All collections must be resolved (matched / create_new / skip).
        const { data: unresolved } = await supabase.from('import_collections')
          .select('id').eq('job_id', jobId)
          .in('client_match_status', ['ambiguous', 'unmatched']).limit(1)
        if ((unresolved?.length ?? 0) > 0) return void bad(res, 409, 'mappings_unresolved')

        // Quota: token/plan enforcement stays where it already lives — inside
        // record_image_upload() during the actual uploads. Here we only RECORD
        // the client-computed estimate (files/bytes from the ZIP listing) into
        // totals for the report; no cheap server-side balance read exists on
        // this surface (documented in PIXIESET-MIGRATION-FEASIBILITY.md).
        const est = (body.estimate ?? null) as Json | null
        const totals = est && typeof est === 'object'
          ? { ...(job.totals ?? {}), estimated_files: Number(est.files ?? 0) || 0, estimated_bytes: Number(est.bytes ?? 0) || 0 }
          : (job.totals ?? {})

        const r = await applyTransition(job, 'start', {
          totals, started_at: job.started_at ?? new Date().toISOString(), error: null,
        })
        if (!r.ok) return void bad(res, 409, r.error)
        if (!r.noop) {
          await appendAudit(supabase, {
            businessId, actorType: 'owner', actorUserId,
            action: asAudit('import_job_started'), targetType: 'import_job', targetId: jobId,
          })
        }
        return void res.status(200).json({ ok: true, job_id: jobId, status: r.status, noop: r.noop })
      }

      // ── pause_job / resume_job ──────────────────────────────────────────
      case 'pause_job':
      case 'resume_job': {
        const jobId = String(body.jobId ?? '')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')
        const r = await applyTransition(job, action === 'pause_job' ? 'pause' : 'resume')
        if (!r.ok) return void bad(res, 409, r.error)
        return void res.status(200).json({ ok: true, job_id: jobId, status: r.status, noop: r.noop })
      }

      // ── cancel_job (SAFE: never deletes uploaded images) ────────────────
      case 'cancel_job': {
        const jobId = String(body.jobId ?? '')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')
        const r = await applyTransition(job, 'cancel', { finished_at: new Date().toISOString() })
        if (!r.ok) return void bad(res, 409, r.error)
        if (!r.noop) {
          await appendAudit(supabase, {
            businessId, actorType: 'owner', actorUserId,
            action: asAudit('import_job_cancelled'), targetType: 'import_job', targetId: jobId,
          })
        }
        return void res.status(200).json({ ok: true, job_id: jobId, status: r.status, noop: r.noop })
      }

      // ── retry_failed ────────────────────────────────────────────────────
      case 'retry_failed': {
        const jobId = String(body.jobId ?? '')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')
        const r = await applyTransition(job, 'retry_failed', { error: null, finished_at: null })
        if (!r.ok) return void bad(res, 409, r.error)
        // Reset failed bookkeeping so the client re-runs just those files.
        await supabase.from('import_files')
          .update({ status: 'pending', error: null })
          .eq('business_id', businessId).eq('status', 'failed')
          .in('collection_id',
            (await supabase.from('import_collections').select('id').eq('job_id', jobId)).data?.map(c => c.id as string) ?? [])
        await supabase.from('import_collections')
          .update({ status: 'importing' }).eq('job_id', jobId).eq('status', 'failed')
        return void res.status(200).json({ ok: true, job_id: jobId, status: r.status })
      }

      // ── update_collection_progress (checkpointing; browser-driven runs) ──
      // Not in the original C7 action list; required for resumable, per-
      // collection checkpoints since uploads run in the BROWSER. Documented in
      // src/components/importer/INTEGRATION.md.
      case 'update_collection_progress': {
        const jobId = String(body.jobId ?? '')
        const collectionId = String(body.collectionId ?? '')
        const job = await loadJob(jobId, businessId)
        if (!job) return void bad(res, 403, 'forbidden')
        if (job.status !== 'running') return void bad(res, 409, 'job_not_running')
        const { data: col } = await supabase.from('import_collections')
          .select('id, job_id, status, stats').eq('id', collectionId)
          .eq('business_id', businessId).eq('job_id', jobId).maybeSingle()
        if (!col) return void bad(res, 403, 'forbidden')

        const colStatus = body.collectionStatus ? String(body.collectionStatus) : null
        if (colStatus && !COLLECTION_STATUSES.has(colStatus)) return void bad(res, 400, 'invalid_collection_status')
        const targetGalleryId = body.targetGalleryId ? String(body.targetGalleryId) : null
        if (targetGalleryId) {
          const { data: g } = await supabase.from('galleries')
            .select('id').eq('id', targetGalleryId).eq('business_id', businessId).maybeSingle()
          if (!g) return void bad(res, 403, 'gallery_forbidden')
        }

        // Per-file bookkeeping (sanitized filenames only; capped batch).
        const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES_PER_CALL) : []
        if (files.length > 0) {
          const rows: Json[] = []
          for (const f of files as Json[]) {
            const s = sanitizeImportFilename(String(f.filename ?? ''))
            if (!s.ok) continue // never persist a hostile name
            const status = FILE_STATUSES.has(String(f.status)) ? String(f.status) : 'pending'
            rows.push({
              collection_id: collectionId, business_id: businessId,
              filename: s.name,
              size_bytes: Number(f.sizeBytes ?? 0) || null,
              content_hash: typeof f.contentHash === 'string' && /^[0-9a-f]{64}$/i.test(f.contentHash) ? f.contentHash.toLowerCase() : null,
              status, error: typeof f.error === 'string' ? f.error.slice(0, 300) : null,
            })
          }
          if (rows.length > 0) await supabase.from('import_files').insert(rows)
        }

        const stats = (body.stats && typeof body.stats === 'object') ? body.stats as Json : null
        const colPatch: Json = {}
        if (colStatus) colPatch.status = colStatus
        if (stats) colPatch.stats = { ...(col.stats as Json ?? {}), ...stats }
        if (targetGalleryId) colPatch.target_gallery_id = targetGalleryId
        if (Object.keys(colPatch).length > 0) {
          await supabase.from('import_collections').update(colPatch).eq('id', collectionId)
        }

        // Checkpoint per collection on the job (resume point).
        const checkpoint = {
          ...(job.checkpoint ?? {}),
          [collectionId]: { status: colStatus ?? col.status, ...(stats ?? {}), updated_at: new Date().toISOString() },
        }
        await supabase.from('import_jobs').update({ checkpoint }).eq('id', jobId)

        if (colStatus === 'imported') {
          await appendAudit(supabase, {
            businessId, actorType: 'owner', actorUserId,
            action: asAudit('import_collection_imported'), targetType: 'import_collection', targetId: collectionId,
            metadata: { job_id: jobId, gallery_id: targetGalleryId },
          })
        }

        // Auto-complete: when every collection reached a terminal state.
        const { data: open } = await supabase.from('import_collections')
          .select('id').eq('job_id', jobId).in('status', ['pending', 'importing']).limit(1)
        let jobStatus: JobStatus = job.status
        if ((open?.length ?? 0) === 0) {
          const r = await applyTransition({ ...job, checkpoint }, 'complete', { finished_at: new Date().toISOString() })
          if (r.ok && !r.noop) {
            jobStatus = r.status
            await appendAudit(supabase, {
              businessId, actorType: 'owner', actorUserId,
              action: asAudit('import_job_completed'), targetType: 'import_job', targetId: jobId,
            })
          } else if (r.ok) jobStatus = r.status
        }

        return void res.status(200).json({ ok: true, job_id: jobId, collection_id: collectionId, job_status: jobStatus })
      }

      // ── job_status ──────────────────────────────────────────────────────
      case 'job_status': {
        const jobId = String(body.jobId ?? '')
        const { data: job } = await supabase.from('import_jobs')
          .select('id, business_id, source_id, kind, status, totals, error, checkpoint, created_at, updated_at, started_at, finished_at')
          .eq('id', jobId).eq('business_id', businessId).maybeSingle()
        if (!job) return void bad(res, 403, 'forbidden')
        const { data: collections } = await supabase.from('import_collections')
          .select('id, source_name, source_url, matched_client_id, client_match_status, target_gallery_id, status, stats, created_at')
          .eq('job_id', jobId).order('created_at', { ascending: true }).limit(2000)
        // Per-file rows for resume/dedupe (uploaded + skipped names & hashes).
        const includeFiles = body.includeFiles === true
        let files: unknown[] = []
        if (includeFiles && (collections?.length ?? 0) > 0) {
          const { data: fileRows } = await supabase.from('import_files')
            .select('collection_id, filename, status, content_hash, size_bytes, error')
            .in('collection_id', (collections ?? []).map(c => c.id as string))
            .limit(10000)
          files = fileRows ?? []
        }
        return void res.status(200).json({ ok: true, job, collections: collections ?? [], files })
      }

      default:
        return void bad(res, 400, 'unknown_action')
    }
  } catch (e) {
    // Full error goes to server logs (and Sentry via withSentry); the client
    // gets a stable generic code with NO raw DB/exception text.
    console.error('[import-center] unhandled error', e)
    return void bad(res, 500, 'internal_error')
  }
}

export default withSentry('import-center', handler)
