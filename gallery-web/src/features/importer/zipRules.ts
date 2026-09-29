// zipRules.ts — BROWSER-SAFE mirror of the Import Center validation rules.
//
// gallery-web/server/importer.ts is the source of truth, but it imports
// node:crypto (for the server-side hash helper), so it cannot be bundled into
// the Vite client. This module re-states ONLY the pure validation rules the
// wizard needs, with identical semantics. Parity is enforced by
// tests/import-center.test.ts, which runs the same vectors through BOTH
// modules and fails if they ever diverge.
//
// If you change a rule here, change server/importer.ts too (and vice versa).

export const CSV_MAX_BYTES = 2 * 1024 * 1024
export const ZIP_ENTRY_MAX_BYTES = 40 * 1024 * 1024
export const JOB_UNCOMPRESSED_MAX_BYTES = 10 * 1024 * 1024 * 1024
export const ZIP_BOMB_RATIO = 100
export const ZIP_MAX_DEPTH = 3
export const ZIP_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024 // jszip loads the whole ZIP in memory
export const FILENAME_MAX_LEN = 200

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

export type SanitizeResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'traversal' | 'absolute' | 'control_chars' | 'empty' }

export function sanitizeImportFilename(raw: string): SanitizeResult {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, reason: 'empty' }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(raw)) return { ok: false, reason: 'control_chars' }
  if (raw.includes('\\')) return { ok: false, reason: 'traversal' }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return { ok: false, reason: 'absolute' }
  const segments = raw.split('/')
  if (segments.some(s => s === '..')) return { ok: false, reason: 'traversal' }
  let name = segments[segments.length - 1].trim()
  if (name === '' || name === '.' || name === '..') return { ok: false, reason: 'empty' }
  if (name.length > FILENAME_MAX_LEN) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot) : ''
    name = name.slice(0, FILENAME_MAX_LEN - ext.length) + ext
  }
  return { ok: true, name }
}

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

  const depth = parts.length - 1
  if (depth > ZIP_MAX_DEPTH) return { verdict: 'reject', reason: 'too_deep' }

  const ext = extOf(sanitized.name)
  const mime = mimeForExt(ext)
  if (!mime) return { verdict: 'reject', reason: 'unsupported_type' }

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

// ── ZIP filename → collection auto-match ────────────────────────────────────

export function normalizeZipStem(zipFilename: string): string {
  return zipFilename
    .replace(/\.zip$/i, '')
    .replace(/[\s_]*[-_(]?\s*(part\s*)?\d+\s*[)]?$/i, '')
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
  return null
}

// ── Browser content hash (same output as server sha256HexBytes) ─────────────

export async function sha256HexBrowser(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    : bytes
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
