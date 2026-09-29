// searchLogic — pure, DOM-free helpers behind GlobalSearch.
//
// Everything here is intentionally free of React / Supabase imports so the
// offline test suite (tests/search.test.ts, run with `npx tsx`) can exercise
// the exact production logic: filter payload building, the debounce timer,
// the stale-response sequence guard and result normalization.

// ─── Types ──────────────────────────────────────────────────────────────────

export type SearchLocale = 'he' | 'en'

/** Raw UI state of the filter panel (strings straight from the inputs). */
export interface SearchFilterState {
  clientId: string          // '' = any
  status: '' | 'live' | 'draft'
  assigned: 'all' | 'yes' | 'no'
  eventType: string
  eventSizeBucket: '' | 'intimate' | 'small' | 'medium' | 'large' | 'massive'
  industry: string
  venueType: '' | 'indoor' | 'outdoor' | 'mixed'
  timeOfDay: '' | 'day' | 'night' | 'mixed'
  yearFrom: string          // '' or 'YYYY'
  yearTo: string
  keywords: string          // comma-separated free text
  importedSource: '' | 'pixieset' | 'generic_csv' | 'local_folder'
}

export const EMPTY_FILTER_STATE: SearchFilterState = {
  clientId: '',
  status: '',
  assigned: 'all',
  eventType: '',
  eventSizeBucket: '',
  industry: '',
  venueType: '',
  timeOfDay: '',
  yearFrom: '',
  yearTo: '',
  keywords: '',
  importedSource: '',
}

/** The p_filters jsonb payload accepted by search_owner_content (contract C5). */
export interface SearchFilterPayload {
  client_id?: string
  status?: 'live' | 'draft'
  assigned?: boolean
  event_type?: string
  event_size_bucket?: string
  industry?: string
  venue_type?: string
  time_of_day?: string
  year_from?: number
  year_to?: number
  keywords?: string[]
  imported_source?: string
}

export interface ClientHit {
  id: string
  name: string
  slug: string | null
  match_reason: string[]
}

export interface GalleryHit {
  id: string
  name: string
  slug: string | null
  status: string | null
  client_id: string | null
  client_name: string | null
  event_date: string | null
  event_type: string | null
  event_location: string | null
  event_size_bucket: string | null
  industry: string | null
  image_count: number | null
  match_reason: string[]
}

export interface ImageHit {
  id: string
  gallery_id: string
  gallery_name: string | null
  filename: string
  thumbnail_path: string | null
  match_reason: string[]
}

export interface SearchResult {
  clients: ClientHit[]
  galleries: GalleryHit[]
  images: ImageHit[]
}

export const EMPTY_RESULT: SearchResult = { clients: [], galleries: [], images: [] }

// ─── Filter payload building ────────────────────────────────────────────────

const YEAR_RE = /^\d{4}$/

/** Split the free-text keywords input into a trimmed, deduped array. */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const kw = part.trim()
    if (kw && !seen.has(kw)) { seen.add(kw); out.push(kw) }
  }
  return out
}

/**
 * Turn the raw filter UI state into the jsonb payload for the RPC.
 * Only meaningful values are emitted: empty strings, 'all', malformed years
 * and empty keyword lists are dropped so the RPC sees "filter not set".
 */
export function buildFilterPayload(state: SearchFilterState): SearchFilterPayload {
  const p: SearchFilterPayload = {}
  const clientId = state.clientId.trim()
  if (clientId) p.client_id = clientId
  if (state.status === 'live' || state.status === 'draft') p.status = state.status
  if (state.assigned === 'yes') p.assigned = true
  else if (state.assigned === 'no') p.assigned = false
  const eventType = state.eventType.trim()
  if (eventType) p.event_type = eventType.slice(0, 60)
  if (state.eventSizeBucket) p.event_size_bucket = state.eventSizeBucket
  const industry = state.industry.trim()
  if (industry) p.industry = industry.slice(0, 60)
  if (state.venueType) p.venue_type = state.venueType
  if (state.timeOfDay) p.time_of_day = state.timeOfDay
  const yearFrom = state.yearFrom.trim()
  if (YEAR_RE.test(yearFrom)) p.year_from = Number(yearFrom)
  const yearTo = state.yearTo.trim()
  if (YEAR_RE.test(yearTo)) p.year_to = Number(yearTo)
  const keywords = parseKeywords(state.keywords)
  if (keywords.length > 0) p.keywords = keywords
  if (state.importedSource) p.imported_source = state.importedSource
  return p
}

export function hasActiveFilters(payload: SearchFilterPayload): boolean {
  return Object.keys(payload).length > 0
}

/** A search should run when there is a query OR at least one active filter. */
export function shouldSearch(query: string, payload: SearchFilterPayload): boolean {
  return query.trim().length >= 1 || hasActiveFilters(payload)
}

// ─── Debounce + stale-response guard ────────────────────────────────────────
//
// supabase.rpc() cannot be aborted mid-flight, so cancellation is emulated:
// every dispatched request takes a monotonically increasing ticket and only
// the holder of the LATEST ticket may commit its response to state. Older
// responses that resolve late are silently dropped (AbortController-style
// behavior without the controller).

export interface SequenceGuard {
  /** Take a new ticket; invalidates all previously issued tickets. */
  next(): number
  /** True only for the most recently issued ticket. */
  isCurrent(ticket: number): boolean
  /** Invalidate every outstanding ticket (e.g. on unmount / reset). */
  invalidate(): void
}

export function createSequenceGuard(): SequenceGuard {
  let latest = 0
  return {
    next() { return ++latest },
    isCurrent(ticket: number) { return ticket === latest },
    invalidate() { latest++ },
  }
}

export interface Debouncer {
  schedule(fn: () => void): void
  cancel(): void
  readonly pending: boolean
}

export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(fn: () => void) {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; fn() }, delayMs)
    },
    cancel() {
      if (timer !== null) { clearTimeout(timer); timer = null }
    },
    get pending() { return timer !== null },
  }
}

// ─── Match-reason mapping ───────────────────────────────────────────────────

/**
 * Field name from the RPC's match_reason array → strings.ts key.
 * Unknown reasons fall back to a generic key so a future RPC field never
 * renders a raw identifier in the UI.
 */
export function matchReasonStringKey(reason: string): string {
  switch (reason) {
    case 'name':           return 'search.reason.name'
    case 'client_name':    return 'search.reason.clientName'
    case 'event_location': return 'search.reason.eventLocation'
    case 'event_type':     return 'search.reason.eventType'
    case 'filename':       return 'search.reason.filename'
    default:               return 'search.reason.other'
  }
}

// ─── Result normalization ───────────────────────────────────────────────────

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function asReasons(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : []
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * Defensive normalization of the RPC's jsonb response. Never throws; rows
 * missing an id are dropped, missing fields become null / [].
 */
export function normalizeSearchResult(raw: unknown): SearchResult {
  if (raw === null || typeof raw !== 'object') return EMPTY_RESULT
  const r = raw as Record<string, unknown>

  const clients: ClientHit[] = []
  for (const row of asArray(r.clients)) {
    const o = (row ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string') continue
    clients.push({
      id: o.id,
      name: str(o.name) ?? '',
      slug: str(o.slug),
      match_reason: asReasons(o.match_reason),
    })
  }

  const galleries: GalleryHit[] = []
  for (const row of asArray(r.galleries)) {
    const o = (row ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string') continue
    galleries.push({
      id: o.id,
      name: str(o.name) ?? '',
      slug: str(o.slug),
      status: str(o.status),
      client_id: str(o.client_id),
      client_name: str(o.client_name),
      event_date: str(o.event_date),
      event_type: str(o.event_type),
      event_location: str(o.event_location),
      event_size_bucket: str(o.event_size_bucket),
      industry: str(o.industry),
      image_count: typeof o.image_count === 'number' ? o.image_count : null,
      match_reason: asReasons(o.match_reason),
    })
  }

  const images: ImageHit[] = []
  for (const row of asArray(r.images)) {
    const o = (row ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.gallery_id !== 'string') continue
    images.push({
      id: o.id,
      gallery_id: o.gallery_id,
      gallery_name: str(o.gallery_name),
      filename: str(o.filename) ?? '',
      thumbnail_path: str(o.thumbnail_path),
      match_reason: asReasons(o.match_reason),
    })
  }

  return { clients, galleries, images }
}

export function isEmptyResult(r: SearchResult): boolean {
  return r.clients.length === 0 && r.galleries.length === 0 && r.images.length === 0
}
