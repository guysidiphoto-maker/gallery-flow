// importer.ts — PURE logic for the Import Center (Pixieset-first migrations).
//
// Everything in this module is offline-testable: CSV parsing, header aliasing,
// client matching, filename sanitization, ZIP-entry validation, content
// hashing, and the job state machine. NO supabase, NO network, NO fs.
// The API endpoint (api/import-center.ts) and the browser wizard both consume
// these helpers so validation rules exist in exactly one place.
//
// Threat model: the CSV and ZIPs come from the photographer's OWN Pixieset
// export, but we still treat them as untrusted input — path traversal entries,
// ZIP bombs, control characters, and password columns are all handled here.

import { createHash } from 'node:crypto'

// ── Limits (single source of truth for the Import Center) ──────────────────

export const CSV_MAX_BYTES = 2 * 1024 * 1024        // 2 MB of CSV text
export const CSV_MAX_ROWS = 5000                     // data rows per CSV
export const ZIP_ENTRY_MAX_BYTES = 40 * 1024 * 1024  // mirrors MAX_UPLOAD_BYTES
export const JOB_UNCOMPRESSED_MAX_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB / job
export const ZIP_BOMB_RATIO = 100                    // uncompressed/compressed > 100x → reject
export const ZIP_MAX_DEPTH = 3                       // folder levels inside the ZIP
export const ZIP_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB per ZIP (jszip is in-memory)
export const FILENAME_MAX_LEN = 200

export const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

export function mimeForExt(ext: string): string | null {
  return EXT_TO_MIME[ext.toLowerCase()] ?? null
}

export function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

// ── CSV parsing (RFC 4180-ish) ──────────────────────────────────────────────
// Handles: UTF-8 BOM, CRLF/LF/CR, quoted fields with "" escapes, embedded
// commas/newlines inside quotes. Rejects oversized input and row floods.

export type CsvParseResult =
  | { ok: true; headers: string[]; rows: string[][] }
  | { ok: false; error: 'csv_too_large' | 'csv_too_many_rows' | 'csv_empty' | 'csv_malformed' }

export function parseCsv(text: string): CsvParseResult {
  if (typeof text !== 'string') return { ok: false, error: 'csv_empty' }
  // Byte-length check (a UTF-8 char can be up to 4 bytes; length*4 short-circuit
  // avoids encoding huge strings just to reject them).
  if (text.length > CSV_MAX_BYTES) return { ok: false, error: 'csv_too_large' }
  let src = text
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1) // strip BOM

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let sawAny = false

  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => {
    pushField()
    // Skip fully empty trailing lines
    if (row.length === 1 && row[0].trim() === '') { row = []; return }
    rows.push(row)
    row = []
    if (rows.length > CSV_MAX_ROWS + 1) throw Object.assign(new Error('rows'), { code: 'rows' })
  }

  try {
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]
      sawAny = true
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = false
        } else field += ch
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        pushField()
      } else if (ch === '\n') {
        pushRow()
      } else if (ch === '\r') {
        if (src[i + 1] === '\n') i++
        pushRow()
      } else {
        field += ch
      }
    }
    if (field !== '' || row.length > 0) pushRow()
  } catch (e) {
    if ((e as { code?: string }).code === 'rows') return { ok: false, error: 'csv_too_many_rows' }
    return { ok: false, error: 'csv_malformed' }
  }
  if (inQuotes) return { ok: false, error: 'csv_malformed' }
  if (!sawAny || rows.length === 0) return { ok: false, error: 'csv_empty' }

  const headers = rows[0].map(h => h.trim())
  const dataRows = rows.slice(1)
  if (dataRows.length > CSV_MAX_ROWS) return { ok: false, error: 'csv_too_many_rows' }
  return { ok: true, headers, rows: dataRows }
}

// ── Header aliasing ─────────────────────────────────────────────────────────
// Case-insensitive, whitespace/punctuation-tolerant matching so exports from
// Pixieset (documented Contacts CSV columns) and hand-made "collections" CSVs
// both map cleanly.

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-./]+/g, ' ').trim()
}

// Any column whose header smells like a credential is DROPPED before storage
// and flagged in the dry-run report. Gallery passwords must never be persisted.
const PASSWORD_HEADER_RE = /password|passcode|pass code|pin\b|pin code|secret/i

export function isPasswordHeader(header: string): boolean {
  return PASSWORD_HEADER_RE.test(normHeader(header))
}

const COLLECTION_ALIASES: Record<string, string[]> = {
  sourceName: ['collection name', 'collection', 'gallery name', 'gallery', 'name', 'event name', 'title'],
  clientName: ['client name', 'client', 'contact name', 'contact', 'customer name', 'customer', 'full name'],
  clientEmail: ['client email', 'email', 'e mail', 'email address', 'contact email', 'customer email'],
  sourceUrl: ['collection url', 'url', 'link', 'gallery url', 'gallery link', 'collection link'],
  eventDate: ['date', 'event date', 'shoot date', 'session date', 'created', 'created at'],
}

// Pixieset Studio Manager Contacts CSV documented columns
// (help.pixieset.com article 35343762224141): First Name, Last Name, Company,
// Email, Type, Address fields, Notes.
const CONTACT_ALIASES: Record<string, string[]> = {
  firstName: ['first name', 'firstname', 'given name'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  company: ['company', 'business', 'organization'],
  email: ['email', 'e mail', 'email address'],
  type: ['type', 'contact type'],
  phone: ['phone', 'phone number', 'mobile'],
  notes: ['notes', 'note'],
}

function buildHeaderMap(headers: string[], aliases: Record<string, string[]>): Map<string, number> {
  const map = new Map<string, number>()
  const normed = headers.map(normHeader)
  for (const [field, names] of Object.entries(aliases)) {
    for (const alias of names) {
      const idx = normed.indexOf(alias)
      if (idx >= 0 && !map.has(field)) { map.set(field, idx); break }
    }
  }
  return map
}

export type CsvKind = 'contacts' | 'collections' | 'unknown'

/** Heuristic: a Pixieset contacts export has First/Last Name; a collections
 *  sheet has some collection/gallery column. */
export function detectCsvKind(headers: string[]): CsvKind {
  const contacts = buildHeaderMap(headers, CONTACT_ALIASES)
  const collections = buildHeaderMap(headers, COLLECTION_ALIASES)
  if (contacts.has('firstName') && contacts.has('email') && !collections.has('sourceName')) return 'contacts'
  if (collections.has('sourceName')) return 'collections'
  if (contacts.has('firstName') || (contacts.has('email') && contacts.has('lastName'))) return 'contacts'
  return 'unknown'
}

export interface CollectionRow {
  sourceName: string
  clientName: string | null
  clientEmail: string | null
  sourceUrl: string | null
  eventDate: string | null
}

export interface ContactRow {
  firstName: string
  lastName: string
  company: string | null
  email: string | null
  type: string | null
  notes: string | null
}

export interface MappedCsv<T> {
  ok: boolean
  error?: string
  rows: T[]
  /** Headers that were recognized and used. */
  usedHeaders: string[]
  /** Password-looking headers — content is NEVER read, stored, or echoed. */
  droppedPasswordColumns: string[]
  /** Headers we did not understand (carried nowhere, listed for transparency). */
  ignoredHeaders: string[]
}

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export function mapCollectionsCsv(headers: string[], rows: string[][]): MappedCsv<CollectionRow> {
  const map = buildHeaderMap(headers, COLLECTION_ALIASES)
  const dropped = headers.filter(isPasswordHeader)
  if (!map.has('sourceName')) {
    return { ok: false, error: 'missing_collection_name_column', rows: [], usedHeaders: [], droppedPasswordColumns: dropped, ignoredHeaders: headers }
  }
  const used = new Set<number>(map.values())
  const out: CollectionRow[] = []
  for (const r of rows) {
    const get = (f: string) => { const i = map.get(f); return i === undefined ? undefined : r[i] }
    const sourceName = clean(get('sourceName'))
    if (!sourceName) continue // skip rows without a collection name
    out.push({
      sourceName: sourceName.slice(0, 200),
      clientName: clean(get('clientName')),
      clientEmail: normalizeEmailForMatch(clean(get('clientEmail'))),
      sourceUrl: clean(get('sourceUrl')),
      eventDate: clean(get('eventDate')),
    })
  }
  return {
    ok: true,
    rows: out,
    usedHeaders: [...used].map(i => headers[i]),
    droppedPasswordColumns: dropped,
    ignoredHeaders: headers.filter((h, i) => !used.has(i) && !isPasswordHeader(h)),
  }
}

export function mapContactsCsv(headers: string[], rows: string[][]): MappedCsv<ContactRow> {
  const map = buildHeaderMap(headers, CONTACT_ALIASES)
  const dropped = headers.filter(isPasswordHeader)
  if (!map.has('email') && !map.has('firstName')) {
    return { ok: false, error: 'missing_contact_columns', rows: [], usedHeaders: [], droppedPasswordColumns: dropped, ignoredHeaders: headers }
  }
  const used = new Set<number>(map.values())
  const out: ContactRow[] = []
  for (const r of rows) {
    const get = (f: string) => { const i = map.get(f); return i === undefined ? undefined : r[i] }
    const firstName = clean(get('firstName')) ?? ''
    const lastName = clean(get('lastName')) ?? ''
    const email = normalizeEmailForMatch(clean(get('email')))
    if (!firstName && !lastName && !email) continue
    out.push({
      firstName, lastName,
      company: clean(get('company')),
      email,
      type: clean(get('type')),
      notes: clean(get('notes')),
    })
  }
  return {
    ok: true,
    rows: out,
    usedHeaders: [...used].map(i => headers[i]),
    droppedPasswordColumns: dropped,
    ignoredHeaders: headers.filter((h, i) => !used.has(i) && !isPasswordHeader(h)),
  }
}

// ── Client matching ─────────────────────────────────────────────────────────
// Policy (contract C7): normalized-email EXACT match → 'matched'.
// Name-only match → 'ambiguous' (NEVER auto-merged; the owner decides).
// Nothing → 'unmatched'.

export function normalizeEmailForMatch(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim().toLowerCase()
  return t === '' ? null : t
}

export function normalizeNameForMatch(raw: string | null | undefined): string {
  return String(raw ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export interface ClientCandidate {
  id: string
  name: string
  /** Known emails for this client (e.g. from client_memberships). */
  emails: string[]
}

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched'

export interface MatchResult {
  status: MatchStatus
  clientId: string | null
  /** Candidate ids for ambiguous matches (owner picks). */
  candidates: string[]
}

export function matchClient(
  row: { clientName: string | null; clientEmail: string | null },
  clients: ClientCandidate[],
): MatchResult {
  const email = normalizeEmailForMatch(row.clientEmail)
  if (email) {
    const byEmail = clients.filter(c => c.emails.some(e => normalizeEmailForMatch(e) === email))
    if (byEmail.length === 1) return { status: 'matched', clientId: byEmail[0].id, candidates: [byEmail[0].id] }
    if (byEmail.length > 1) return { status: 'ambiguous', clientId: null, candidates: byEmail.map(c => c.id) }
  }
  const name = normalizeNameForMatch(row.clientName)
  if (name) {
    const byName = clients.filter(c => normalizeNameForMatch(c.name) === name)
    // Name-only is NEVER auto-merged — always requires owner confirmation.
    if (byName.length > 0) return { status: 'ambiguous', clientId: null, candidates: byName.map(c => c.id) }
  }
  return { status: 'unmatched', clientId: null, candidates: [] }
}

// ── Filename sanitization ───────────────────────────────────────────────────
// ZIP entries and CSV-supplied names are untrusted. We strip path components
// and refuse anything that smells like traversal or binary garbage.

export type SanitizeResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'traversal' | 'absolute' | 'control_chars' | 'empty' }

export function sanitizeImportFilename(raw: string): SanitizeResult {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, reason: 'empty' }
  // Control characters anywhere → reject outright (no legitimate export has them).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(raw)) return { ok: false, reason: 'control_chars' }
  // Backslashes are treated as hostile separators (Windows-style traversal).
  if (raw.includes('\\')) return { ok: false, reason: 'traversal' }
  // Absolute paths (POSIX or drive-letter).
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return { ok: false, reason: 'absolute' }
  const segments = raw.split('/')
  if (segments.some(s => s === '..')) return { ok: false, reason: 'traversal' }
  // Keep only the basename — internal ZIP folders are handled separately.
  let name = segments[segments.length - 1].trim()
  if (name === '' || name === '.' || name === '..') return { ok: false, reason: 'empty' }
  if (name.length > FILENAME_MAX_LEN) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot) : ''
    name = name.slice(0, FILENAME_MAX_LEN - ext.length) + ext
  }
  return { ok: true, name }
}

/** Deduplicate names within one import batch: "a.jpg" → "a (2).jpg" → "a (3).jpg". */
export function dedupeFilename(name: string, used: Set<string>): string {
  const key = (n: string) => n.toLowerCase()
  if (!used.has(key(name))) { used.add(key(name)); return name }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!used.has(key(candidate))) { used.add(key(candidate)); return candidate }
  }
}

// ── ZIP entry validation ────────────────────────────────────────────────────
// Runs on entry METADATA (path + sizes) before any bytes are inflated, so a
// ZIP bomb is rejected without paying its decompression cost.

export interface ZipEntryMeta {
  path: string
  isDirectory: boolean
  uncompressedSize: number
  compressedSize: number
}

export type ZipEntryVerdict =
  | { verdict: 'ok'; filename: string; mime: string }
  | { verdict: 'skip'; reason: 'directory' | 'macosx' | 'dotfile' }
  | { verdict: 'reject'; reason: 'traversal' | 'absolute' | 'control_chars' | 'empty' | 'unsupported_type' | 'too_large' | 'too_deep' | 'bomb_ratio' }

export function validateZipEntry(entry: ZipEntryMeta): ZipEntryVerdict {
  if (entry.isDirectory || entry.path.endsWith('/')) return { verdict: 'skip', reason: 'directory' }
  const parts = entry.path.split('/')
  if (parts[0] === '__MACOSX') return { verdict: 'skip', reason: 'macosx' }
  const base = parts[parts.length - 1]
  if (base.startsWith('.') || base === 'Thumbs.db' || base === 'desktop.ini') return { verdict: 'skip', reason: 'dotfile' }

  const sanitized = sanitizeImportFilename(entry.path)
  if (!sanitized.ok) return { verdict: 'reject', reason: sanitized.reason }

  // Depth: number of FOLDER levels above the file. Pixieset's internal ZIP
  // layout is undocumented — sets may appear as one-level subfolders — so we
  // accept up to ZIP_MAX_DEPTH levels and reject deeper nesting.
  const depth = parts.length - 1
  if (depth > ZIP_MAX_DEPTH) return { verdict: 'reject', reason: 'too_deep' }

  const ext = extOf(sanitized.name)
  const mime = mimeForExt(ext)
  if (!mime || !(ALLOWED_IMAGE_EXTS as readonly string[]).includes(ext)) {
    return { verdict: 'reject', reason: 'unsupported_type' }
  }

  if (entry.uncompressedSize > ZIP_ENTRY_MAX_BYTES) return { verdict: 'reject', reason: 'too_large' }
  if (entry.uncompressedSize <= 0) return { verdict: 'reject', reason: 'empty' }

  const ratio = entry.uncompressedSize / Math.max(entry.compressedSize, 1)
  if (ratio > ZIP_BOMB_RATIO) return { verdict: 'reject', reason: 'bomb_ratio' }

  return { verdict: 'ok', filename: sanitized.name, mime }
}

export interface ZipSummary {
  accepted: Array<{ path: string; filename: string; mime: string; sizeBytes: number }>
  skipped: Array<{ path: string; reason: string }>
  rejected: Array<{ path: string; reason: string }>
  totalUncompressedBytes: number
  /** True when the ACCEPTED total exceeds the per-job cap. */
  overJobCap: boolean
}

export function summarizeZipEntries(entries: ZipEntryMeta[]): ZipSummary {
  const accepted: ZipSummary['accepted'] = []
  const skipped: ZipSummary['skipped'] = []
  const rejected: ZipSummary['rejected'] = []
  const used = new Set<string>()
  let total = 0
  for (const e of entries) {
    const v = validateZipEntry(e)
    if (v.verdict === 'ok') {
      const filename = dedupeFilename(v.filename, used)
      total += e.uncompressedSize
      accepted.push({ path: e.path, filename, mime: v.mime, sizeBytes: e.uncompressedSize })
    } else if (v.verdict === 'skip') {
      skipped.push({ path: e.path, reason: v.reason })
    } else {
      rejected.push({ path: e.path, reason: v.reason })
    }
  }
  return { accepted, skipped, rejected, totalUncompressedBytes: total, overJobCap: total > JOB_UNCOMPRESSED_MAX_BYTES }
}

// ── Content hashing (duplicate detection) ───────────────────────────────────
// SHA-256 over the file bytes. The browser computes the same digest via
// crypto.subtle; identical hex output lets import_files.content_hash act as a
// cross-run duplicate ledger.

export function sha256HexBytes(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// ── Job state machine ───────────────────────────────────────────────────────
// Statuses (migration 099): draft → dry_run → ready → running ⇄ paused →
// completed | failed | cancelled. Transitions are IDEMPOTENT: re-issuing the
// action that produced the current state is a no-op success, never an error.

export type JobStatus =
  | 'draft' | 'dry_run' | 'ready' | 'running' | 'paused'
  | 'completed' | 'failed' | 'cancelled'

export type JobAction =
  | 'parse_csv' | 'mark_ready' | 'start' | 'pause' | 'resume'
  | 'cancel' | 'complete' | 'fail' | 'retry_failed'

const ACTION_TARGET: Record<JobAction, JobStatus> = {
  parse_csv: 'dry_run',
  mark_ready: 'ready',
  start: 'running',
  pause: 'paused',
  resume: 'running',
  cancel: 'cancelled',
  complete: 'completed',
  fail: 'failed',
  retry_failed: 'running',
}

const ALLOWED_FROM: Record<JobAction, JobStatus[]> = {
  parse_csv: ['draft', 'dry_run', 'ready'],          // re-parse allowed pre-run
  mark_ready: ['dry_run', 'ready'],
  start: ['ready', 'dry_run', 'running'],            // running → no-op
  pause: ['running', 'paused'],                      // paused → no-op
  resume: ['paused', 'running'],                     // running → no-op
  cancel: ['draft', 'dry_run', 'ready', 'running', 'paused', 'failed', 'cancelled'],
  complete: ['running', 'completed'],
  fail: ['running', 'paused'],
  retry_failed: ['failed', 'completed', 'running'],  // retry leftovers; running → no-op
}

export type TransitionResult =
  | { ok: true; next: JobStatus; noop: boolean }
  | { ok: false; error: 'invalid_transition'; from: JobStatus; action: JobAction }

export function transitionJob(from: JobStatus, action: JobAction): TransitionResult {
  const target = ACTION_TARGET[action]
  if (from === target) return { ok: true, next: target, noop: true } // idempotent
  if (!ALLOWED_FROM[action].includes(from)) {
    return { ok: false, error: 'invalid_transition', from, action }
  }
  return { ok: true, next: target, noop: false }
}

export function isTerminalStatus(s: JobStatus): boolean {
  return s === 'completed' || s === 'cancelled'
}

// ── ZIP ↔ collection auto-matching ──────────────────────────────────────────
// Pixieset per-collection ZIPs are typically named after the collection (and
// large collections split into "Name-1.zip", "Name-2.zip"). Match on a
// normalized stem; the owner can always re-map manually in the wizard.

export function normalizeZipStem(zipFilename: string): string {
  return zipFilename
    .replace(/\.zip$/i, '')
    .replace(/[\s_]*[-_(]?\s*(part\s*)?\d+\s*[)]?$/i, '') // trailing part numbers
    .toLowerCase()
    .replace(/[\s_\-]+/g, ' ')
    .trim()
}

export function autoMatchZipToCollection(
  zipFilename: string,
  collections: Array<{ id: string; sourceName: string }>,
): string | null {
  const stem = normalizeZipStem(zipFilename)
  if (!stem) return null
  const exact = collections.filter(c => normalizeZipStem(c.sourceName + '.zip') === stem)
  if (exact.length === 1) return exact[0].id
  return null // ambiguous or none → manual mapping
}
