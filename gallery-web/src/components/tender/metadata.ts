// tender/metadata.ts — pure, dependency-free helpers shared by the tender UI,
// the /api/gallery-metadata endpoint and the offline tests (tests/tender.test.ts).
//
// KEEP THIS FILE PURE: no supabase import, no import.meta.env, no DOM. The API
// function imports it server-side (Vercel bundles the relative TS import) and
// the tsx tests import it offline.

// ─── Taxonomy ────────────────────────────────────────────────────────────────

/** Event-type taxonomy — mirrors the hardcoded list in TenderBuilder.tsx
 *  (client-facing tab, which we must not modify). Keys are the stored values. */
export const EVENT_TYPES: { key: string; he: string; en: string; icon: string }[] = [
  { key: 'conference',      he: 'כנס',             en: 'Conference',        icon: '🎤' },
  { key: 'corporate-event', he: 'אירוע חברה',      en: 'Corporate event',   icon: '🏢' },
  { key: 'government',      he: 'אירוע ממשלתי',    en: 'Government event',  icon: '🏛️' },
  { key: 'retreat-abroad',  he: 'נופש בחו״ל',      en: 'Retreat abroad',    icon: '✈️' },
  { key: 'retreat-local',   he: 'נופש חברה בארץ',  en: 'Local retreat',     icon: '🏖️' },
  { key: 'pre-event',       he: 'קדם',             en: 'Pre-event',         icon: '📋' },
  { key: 'other',           he: 'אחר',             en: 'Other',             icon: '📸' },
]

/** Size buckets per migration 097 (≈ <50, 50–150, 150–500, 500–2000, 2000+). */
export const EVENT_SIZE_BUCKETS = ['intimate', 'small', 'medium', 'large', 'massive'] as const
export type EventSizeBucket = (typeof EVENT_SIZE_BUCKETS)[number]

export const VENUE_TYPES = ['indoor', 'outdoor', 'mixed'] as const
export type VenueType = (typeof VENUE_TYPES)[number]

export const TIMES_OF_DAY = ['day', 'night', 'mixed'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

/** Server-side length caps — MUST match migration 064 + 097 CHECK constraints. */
export const METADATA_LIMITS = {
  event_type: 60,       // 064
  event_location: 120,  // 064
  industry: 60,         // 097
  keyword: 40,          // enforced here (SQL caps only the array size)
  keywords_max: 20,     // 097
} as const

// ─── Metadata patch validation (used by /api/gallery-metadata) ──────────────

export type MetadataPatch = {
  event_type?: string | null
  event_location?: string | null
  event_date?: string | null
  event_size_bucket?: EventSizeBucket | null
  industry?: string | null
  venue_type?: VenueType | null
  time_of_day?: TimeOfDay | null
  event_keywords?: string[]
}

export type ValidatePatchResult =
  | { ok: true; patch: MetadataPatch; fields: string[] }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function inList(v: unknown, list: readonly string[]): boolean {
  return typeof v === 'string' && list.includes(v)
}

/** null | trimmed string; empty string collapses to null (back to Unclassified). */
function normText(v: unknown): string | null {
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Validate an update_gallery_metadata body. Only the eight known fields are
 * read — anything else in the body (action, galleryId, ...) is ignored.
 * A field is "present" when the key exists on the input (so `null` explicitly
 * clears back to Unclassified). Fails closed on ANY invalid value: the whole
 * patch is rejected, nothing is partially applied.
 */
export function validateGalleryMetadataPatch(input: Record<string, unknown>): ValidatePatchResult {
  const patch: MetadataPatch = {}
  const fields: string[] = []

  // Free-text fields with length caps.
  const textFields: { key: 'event_type' | 'event_location' | 'industry'; max: number }[] = [
    { key: 'event_type', max: METADATA_LIMITS.event_type },
    { key: 'event_location', max: METADATA_LIMITS.event_location },
    { key: 'industry', max: METADATA_LIMITS.industry },
  ]
  for (const { key, max } of textFields) {
    if (!(key in input)) continue
    const raw = input[key]
    if (raw !== null && typeof raw !== 'string') return { ok: false, error: `${key}_invalid` }
    const v = normText(raw)
    if (v !== null && v.length > max) return { ok: false, error: `${key}_too_long` }
    patch[key] = v
    fields.push(key)
  }

  // Enums (nullable).
  const enumFields: { key: 'event_size_bucket' | 'venue_type' | 'time_of_day'; list: readonly string[] }[] = [
    { key: 'event_size_bucket', list: EVENT_SIZE_BUCKETS },
    { key: 'venue_type', list: VENUE_TYPES },
    { key: 'time_of_day', list: TIMES_OF_DAY },
  ]
  for (const { key, list } of enumFields) {
    if (!(key in input)) continue
    const v = normText(input[key])
    if (v !== null && !inList(v, list)) return { ok: false, error: `${key}_invalid` }
    ;(patch as Record<string, unknown>)[key] = v
    fields.push(key)
  }

  // Date: strict YYYY-MM-DD and must be a real calendar date.
  if ('event_date' in input) {
    const v = normText(input.event_date)
    if (v !== null) {
      if (!DATE_RE.test(v)) return { ok: false, error: 'event_date_invalid' }
      const d = new Date(`${v}T00:00:00Z`)
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
        return { ok: false, error: 'event_date_invalid' }
      }
    }
    patch.event_date = v
    fields.push('event_date')
  }

  // Keywords: string[] (never null — '{}' is the empty state), trimmed,
  // deduped, ≤20 entries, each ≤40 chars.
  if ('event_keywords' in input) {
    const raw = input.event_keywords
    if (!Array.isArray(raw)) return { ok: false, error: 'event_keywords_invalid' }
    const cleaned: string[] = []
    for (const k of raw) {
      if (typeof k !== 'string') return { ok: false, error: 'event_keywords_invalid' }
      const v = k.trim()
      if (v === '') continue
      if (v.length > METADATA_LIMITS.keyword) return { ok: false, error: 'keyword_too_long' }
      if (!cleaned.includes(v)) cleaned.push(v)
    }
    if (cleaned.length > METADATA_LIMITS.keywords_max) return { ok: false, error: 'too_many_keywords' }
    patch.event_keywords = cleaned
    fields.push('event_keywords')
  }

  if (fields.length === 0) return { ok: false, error: 'no_fields' }
  return { ok: true, patch, fields }
}

// ─── Gallery-in-business check (fail closed) ────────────────────────────────

/** Minimal structural slice of the supabase query builder — lets the API pass
 *  the real service-role client and the tests pass the cpv2-style mock. */
export interface GalleryDbLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: { id?: unknown; client_id?: unknown } | null }>
        }
      }
    }
  }
}

/**
 * Assert a gallery belongs to businessId (server-verified, mirrors
 * clientBelongsToBusiness in server/clientAdmin.ts). Fails closed: any miss
 * (wrong tenant, unknown id, null data) → belongs:false.
 */
export async function galleryBelongsToBusiness(
  db: GalleryDbLike,
  galleryId: string,
  businessId: string,
): Promise<{ belongs: boolean; clientId: string | null }> {
  const { data } = await db
    .from('galleries').select('id, client_id')
    .eq('id', galleryId).eq('business_id', businessId).maybeSingle()
  if (!data || !data.id) return { belongs: false, clientId: null }
  return { belongs: true, clientId: typeof data.client_id === 'string' ? data.client_id : null }
}

// ─── Match reasons (client-side, honest: which filters matched) ─────────────

export interface TenderFilters {
  event_type?: string
  event_size_bucket?: string
  industry?: string
  client_id?: string
  location?: string
  venue_type?: string
  time_of_day?: string
  year_from?: number
  year_to?: number
  keywords?: string[]
}

export interface GalleryLike {
  name?: string | null
  client_id?: string | null
  client_name?: string | null
  event_type?: string | null
  event_location?: string | null
  event_date?: string | null
  event_size_bucket?: string | null
  industry?: string | null
  venue_type?: string | null
  time_of_day?: string | null
  event_keywords?: string[] | null
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/**
 * Compute which brief filters a gallery row actually satisfied. Pure
 * derivation from returned fields — NO invented relevance scores. Returned
 * keys are stable identifiers the UI maps to localized labels.
 */
export function computeMatchReasons(g: GalleryLike, filters: TenderFilters, query = ''): string[] {
  const reasons: string[] = []
  const q = norm(query)
  if (q) {
    if (norm(g.name).includes(q)) reasons.push('name')
    if (norm(g.client_name).includes(q)) reasons.push('client')
    if (norm(g.event_location).includes(q)) reasons.push('event_location')
  }
  if (filters.event_type && norm(g.event_type) === norm(filters.event_type)) reasons.push('event_type')
  if (filters.event_size_bucket && g.event_size_bucket === filters.event_size_bucket) reasons.push('event_size_bucket')
  if (filters.industry && norm(g.industry).includes(norm(filters.industry))) reasons.push('industry')
  if (filters.client_id && g.client_id === filters.client_id) reasons.push('client')
  if (filters.location && norm(g.event_location).includes(norm(filters.location))) reasons.push('event_location')
  if (filters.venue_type && g.venue_type === filters.venue_type) reasons.push('venue_type')
  if (filters.time_of_day && g.time_of_day === filters.time_of_day) reasons.push('time_of_day')
  if ((filters.year_from || filters.year_to) && g.event_date) {
    const y = Number(String(g.event_date).slice(0, 4))
    if (Number.isFinite(y)
      && (!filters.year_from || y >= filters.year_from)
      && (!filters.year_to || y <= filters.year_to)) reasons.push('year')
  }
  if (filters.keywords && filters.keywords.length > 0 && Array.isArray(g.event_keywords)) {
    const have = g.event_keywords.map(norm)
    if (filters.keywords.some(k => have.includes(norm(k)))) reasons.push('keywords')
  }
  return [...new Set(reasons)]
}

// ─── Collection item dedupe ──────────────────────────────────────────────────

export interface CollectionItemLike {
  gallery_id: string
  image_id: string | null
}

const itemKey = (i: CollectionItemLike) => `${i.gallery_id}::${i.image_id ?? ''}`

/** Drop duplicate (gallery_id, image_id) pairs, keeping first occurrence.
 *  Mirrors the two partial unique indexes in migration 100. */
export function dedupeCollectionItems<T extends CollectionItemLike>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const k = itemKey(it)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

/** True when the (gallery, image) pair already exists in the list. */
export function hasCollectionItem(items: CollectionItemLike[], galleryId: string, imageId: string | null): boolean {
  return items.some(i => i.gallery_id === galleryId && (i.image_id ?? null) === (imageId ?? null))
}
