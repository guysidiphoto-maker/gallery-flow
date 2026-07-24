// GlobalSearch — owner-side global search surface (Client Portal V2, C5).
//
// Mounted by the integrator as a Dashboard view (see INTEGRATION.md). Calls
// the self-scoped RPC `search_owner_content` (migration 098; needs 097 first)
// with a 300ms debounce. supabase.rpc cannot be aborted, so stale responses
// are dropped with a request-sequence guard instead of an AbortController.
// Navigation is delegated to the integrator via onOpenGallery / onOpenClient.
// Photos render THUMBNAILS ONLY via the existing displayUrl() pattern; the
// component never loads a full image collection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { supabase, displayUrl } from '../../supabase'
import {
  EMPTY_FILTER_STATE, EMPTY_RESULT,
  buildFilterPayload, createDebouncer, createSequenceGuard,
  hasActiveFilters, isEmptyResult, matchReasonStringKey,
  normalizeSearchResult, shouldSearch,
} from './searchLogic'
import type {
  ClientHit, GalleryHit, ImageHit, SearchFilterState, SearchLocale, SearchResult,
} from './searchLogic'
import { dirFor, t } from './strings'

const IMAGE_BUCKET = 'gallery-images'
const DEBOUNCE_MS = 300

// Editorial-minimal palette, copied from the Dashboard constants (same values
// as components/clients/theme.ts; kept local so wave-1 dirs stay independent).
const c = {
  accent: '#141413',
  bgSubtle: '#FAF9F5',
  card: '#FBFBF9',
  cardSolid: '#FFFFFF',
  border: '#D0D0D0',
  textPrimary: '#141413',
  textSecondary: '#333333',
  textMuted: '#767470',
  statusLive: '#7B8F6E',
} as const

export interface GlobalSearchProps {
  /** Open a gallery in the Dashboard's in-page gallery view. */
  onOpenGallery: (galleryId: string) => void
  /** Open a client (Clients Manager detail). */
  onOpenClient: (clientId: string) => void
  /** UI language. Wave 2: pass useOwnerLocale().locale. Default Hebrew. */
  locale?: SearchLocale
  /** Optional client list for the client filter select (id + display name).
   *  When omitted or empty the client filter is hidden. */
  clientOptions?: Array<{ id: string; name: string }>
}

type Phase = 'idle' | 'loading' | 'done' | 'error'

export default function GlobalSearch({
  onOpenGallery,
  onOpenClient,
  locale = 'he',
  clientOptions = [],
}: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTER_STATE)
  const [showFilters, setShowFilters] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT)
  const [reloadTick, setReloadTick] = useState(0)

  const guardRef = useRef(createSequenceGuard())
  const debouncerRef = useRef(createDebouncer(DEBOUNCE_MS))

  const payload = useMemo(() => buildFilterPayload(filters), [filters])
  const dir = dirFor(locale)
  const tr = useCallback((key: string) => t(locale, key), [locale])

  useEffect(() => {
    const debouncer = debouncerRef.current
    const guard = guardRef.current

    if (!shouldSearch(query, payload)) {
      debouncer.cancel()
      guard.invalidate()
      setPhase('idle')
      setResult(EMPTY_RESULT)
      return
    }

    debouncer.schedule(() => {
      const ticket = guard.next()
      setPhase('loading')
      void (async () => {
        const { data, error } = await supabase.rpc('search_owner_content', {
          p_query: query.trim(),
          p_filters: payload,
        })
        if (!guard.isCurrent(ticket)) return   // a newer request took over
        if (error) {
          setPhase('error')
          setResult(EMPTY_RESULT)
          return
        }
        setResult(normalizeSearchResult(data))
        setPhase('done')
      })()
    })

    return () => { debouncer.cancel() }
  }, [query, payload, reloadTick])

  // Invalidate in-flight responses on unmount.
  useEffect(() => () => {
    debouncerRef.current.cancel()
    guardRef.current.invalidate()
  }, [])

  const activeFilterCount = Object.keys(payload).length

  return (
    <div dir={dir} style={{ maxWidth: 960, margin: '0 auto', color: c.textPrimary }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
          {tr('search.title')}
        </h2>
        <p style={{ fontSize: 13, color: c.textMuted, margin: 0 }}>{tr('search.subtitle')}</p>
      </div>

      {/* Search input */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tr('search.placeholder')}
          aria-label={tr('search.title')}
          style={{
            flex: 1, padding: '12px 14px', fontSize: 15,
            background: c.cardSolid, color: c.textPrimary,
            border: `1px solid ${c.border}`, borderRadius: 4, outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          style={{
            padding: '11px 16px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
            background: showFilters || activeFilterCount > 0 ? c.accent : c.cardSolid,
            color: showFilters || activeFilterCount > 0 ? c.bgSubtle : c.textPrimary,
            border: `1px solid ${showFilters || activeFilterCount > 0 ? c.accent : c.border}`,
            borderRadius: 4,
          }}
        >
          {tr('search.filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          clientOptions={clientOptions}
          locale={locale}
        />
      )}

      {/* Body */}
      {phase === 'idle' && (
        <CenteredNote title={tr('search.idleTitle')} body={tr('search.idleBody')} />
      )}

      {phase === 'loading' && <Skeletons />}

      {phase === 'error' && (
        <CenteredNote
          title={tr('search.error')}
          action={
            <button
              type="button"
              onClick={() => setReloadTick(n => n + 1)}
              style={{
                padding: '9px 18px', fontSize: 13, cursor: 'pointer',
                background: 'transparent', color: c.textPrimary,
                border: `1px solid ${c.accent}`, borderRadius: 4,
              }}
            >
              {tr('search.retry')}
            </button>
          }
        />
      )}

      {phase === 'done' && isEmptyResult(result) && (
        <CenteredNote title={tr('search.emptyTitle')} body={tr('search.emptyBody')} />
      )}

      {phase === 'done' && !isEmptyResult(result) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {result.clients.length > 0 && (
            <Section title={tr('search.section.clients')} count={result.clients.length}>
              {result.clients.map(hit => (
                <ClientRow key={hit.id} hit={hit} locale={locale} onOpen={onOpenClient} />
              ))}
            </Section>
          )}
          {result.galleries.length > 0 && (
            <Section title={tr('search.section.galleries')} count={result.galleries.length}>
              {result.galleries.map(hit => (
                <GalleryRow key={hit.id} hit={hit} locale={locale} onOpen={onOpenGallery} />
              ))}
            </Section>
          )}
          {result.images.length > 0 && (
            <Section
              title={tr('search.section.images')}
              count={result.images.length}
              note={result.images.length >= 60 ? tr('search.imagesCap') : undefined}
            >
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              }}>
                {result.images.map(hit => (
                  <ImageCard key={hit.id} hit={hit} locale={locale} onOpen={onOpenGallery} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Filter panel ───────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, clientOptions, locale }: {
  filters: SearchFilterState
  onChange: (next: SearchFilterState) => void
  clientOptions: Array<{ id: string; name: string }>
  locale: SearchLocale
}) {
  const tr = (key: string) => t(locale, key)
  const set = <K extends keyof SearchFilterState>(key: K, value: SearchFilterState[K]) =>
    onChange({ ...filters, [key]: value })

  const fieldStyle: CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
    background: c.cardSolid, color: c.textPrimary,
    border: `1px solid ${c.border}`, borderRadius: 4,
  }
  const labelStyle: CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
    color: c.textMuted, marginBottom: 5, textTransform: 'uppercase',
  }

  return (
    <div style={{
      background: c.card, border: `1px solid ${c.border}`, borderRadius: 4,
      padding: 16, marginBottom: 18,
    }}>
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      }}>
        {clientOptions.length > 0 && (
          <label>
            <span style={labelStyle}>{tr('filter.client')}</span>
            <select style={fieldStyle} value={filters.clientId}
              onChange={e => set('clientId', e.target.value)}>
              <option value="">{tr('filter.any')}</option>
              {clientOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span style={labelStyle}>{tr('filter.status')}</span>
          <select style={fieldStyle} value={filters.status}
            onChange={e => set('status', e.target.value as SearchFilterState['status'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="live">{tr('filter.status.live')}</option>
            <option value="draft">{tr('filter.status.draft')}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.assigned')}</span>
          <select style={fieldStyle} value={filters.assigned}
            onChange={e => set('assigned', e.target.value as SearchFilterState['assigned'])}>
            <option value="all">{tr('filter.any')}</option>
            <option value="yes">{tr('filter.assigned.yes')}</option>
            <option value="no">{tr('filter.assigned.no')}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.eventType')}</span>
          <input style={fieldStyle} type="text" value={filters.eventType} maxLength={60}
            placeholder={tr('filter.eventType.ph')}
            onChange={e => set('eventType', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.size')}</span>
          <select style={fieldStyle} value={filters.eventSizeBucket}
            onChange={e => set('eventSizeBucket', e.target.value as SearchFilterState['eventSizeBucket'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="intimate">{tr('filter.size.intimate')}</option>
            <option value="small">{tr('filter.size.small')}</option>
            <option value="medium">{tr('filter.size.medium')}</option>
            <option value="large">{tr('filter.size.large')}</option>
            <option value="massive">{tr('filter.size.massive')}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.industry')}</span>
          <input style={fieldStyle} type="text" value={filters.industry} maxLength={60}
            placeholder={tr('filter.industry.ph')}
            onChange={e => set('industry', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.venue')}</span>
          <select style={fieldStyle} value={filters.venueType}
            onChange={e => set('venueType', e.target.value as SearchFilterState['venueType'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="indoor">{tr('filter.venue.indoor')}</option>
            <option value="outdoor">{tr('filter.venue.outdoor')}</option>
            <option value="mixed">{tr('filter.venue.mixed')}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.time')}</span>
          <select style={fieldStyle} value={filters.timeOfDay}
            onChange={e => set('timeOfDay', e.target.value as SearchFilterState['timeOfDay'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="day">{tr('filter.time.day')}</option>
            <option value="night">{tr('filter.time.night')}</option>
            <option value="mixed">{tr('filter.time.mixed')}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.yearFrom')}</span>
          <input style={fieldStyle} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearFrom} placeholder="2024"
            onChange={e => set('yearFrom', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.yearTo')}</span>
          <input style={fieldStyle} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearTo} placeholder="2026"
            onChange={e => set('yearTo', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.keywords')}</span>
          <input style={fieldStyle} type="text" value={filters.keywords}
            placeholder={tr('filter.keywords.ph')}
            onChange={e => set('keywords', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>{tr('filter.imported')}</span>
          <select style={fieldStyle} value={filters.importedSource}
            onChange={e => set('importedSource', e.target.value as SearchFilterState['importedSource'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="pixieset">{tr('filter.imported.pixieset')}</option>
            <option value="generic_csv">{tr('filter.imported.generic_csv')}</option>
            <option value="local_folder">{tr('filter.imported.local_folder')}</option>
          </select>
        </label>
      </div>
      <div style={{ marginTop: 14, textAlign: 'end' }}>
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER_STATE)}
          disabled={!hasActiveFilters(buildFilterPayload(filters))}
          style={{
            padding: '8px 14px', fontSize: 12, cursor: 'pointer',
            background: 'transparent', color: c.textSecondary,
            border: `1px solid ${c.border}`, borderRadius: 4,
          }}
        >
          {t(locale, 'search.clearFilters')}
        </button>
      </div>
    </div>
  )
}

// ─── Result building blocks ─────────────────────────────────────────────────

function Section({ title, count, note, children }: {
  title: string
  count: number
  note?: string
  children: ReactNode
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h3 style={{
          fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: c.textMuted, margin: 0,
        }}>
          {title}
        </h3>
        <span style={{ fontSize: 12, color: c.textMuted }}>{count}</span>
        {note && <span style={{ fontSize: 11, color: c.textMuted }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  )
}

function MatchChips({ reasons, locale }: { reasons: string[]; locale: SearchLocale }) {
  if (reasons.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: c.textMuted }}>{t(locale, 'search.matched')}</span>
      {reasons.map(reason => (
        <span key={reason} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: c.bgSubtle, border: `1px solid ${c.border}`, color: c.textSecondary,
        }}>
          {t(locale, matchReasonStringKey(reason))}
        </span>
      ))}
    </span>
  )
}

const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
  padding: '12px 14px', textAlign: 'start', cursor: 'pointer',
  background: c.card, border: `1px solid ${c.border}`, borderRadius: 4,
  color: c.textPrimary, font: 'inherit',
}

function ClientRow({ hit, locale, onOpen }: {
  hit: ClientHit
  locale: SearchLocale
  onOpen: (clientId: string) => void
}) {
  return (
    <button type="button" style={rowStyle} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openClient')}: ${hit.name}`}>
      <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{hit.name}</span>
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}

function GalleryRow({ hit, locale, onOpen }: {
  hit: GalleryHit
  locale: SearchLocale
  onOpen: (galleryId: string) => void
}) {
  const meta = [
    hit.client_name ?? t(locale, 'search.unassigned'),
    hit.event_date,
    hit.event_type,
    hit.event_location,
    hit.image_count !== null ? `${hit.image_count} ${t(locale, 'search.imagesCount')}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <button type="button" style={rowStyle} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openGallery')}: ${hit.name}`}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{hit.name}</span>
          {(hit.status === 'live' || hit.status === 'draft') && (
            <span style={{
              fontSize: 11, padding: '1px 8px', borderRadius: 999,
              border: `1px solid ${hit.status === 'live' ? c.statusLive : c.border}`,
              color: hit.status === 'live' ? c.statusLive : c.textMuted,
            }}>
              {t(locale, hit.status === 'live' ? 'search.status.live' : 'search.status.draft')}
            </span>
          )}
        </span>
        {meta && (
          <span style={{
            display: 'block', fontSize: 12, color: c.textMuted, marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {meta}
          </span>
        )}
      </span>
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}

function ImageCard({ hit, locale, onOpen }: {
  hit: ImageHit
  locale: SearchLocale
  onOpen: (galleryId: string) => void
}) {
  // Same thumbnail pattern the rest of the app uses: displayUrl serves the
  // pre-baked derivative directly, or a bounded transform for original paths.
  const thumbUrl = hit.thumbnail_path
    ? displayUrl(IMAGE_BUCKET, hit.thumbnail_path, 320)
    : null

  return (
    <button type="button" onClick={() => onOpen(hit.gallery_id)}
      aria-label={`${t(locale, 'search.openGallery')}: ${hit.gallery_name ?? hit.filename}`}
      style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 10 }}>
      <span style={{
        display: 'block', width: '100%', aspectRatio: '3 / 2', overflow: 'hidden',
        borderRadius: 3, background: c.bgSubtle,
      }}>
        {thumbUrl && (
          <img src={thumbUrl} alt={hit.filename} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </span>
      <span style={{
        fontSize: 12, color: c.textPrimary, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'start',
      }}>
        {hit.filename}
      </span>
      {hit.gallery_name && (
        <span style={{
          fontSize: 11, color: c.textMuted, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hit.gallery_name}
        </span>
      )}
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}

// ─── States ─────────────────────────────────────────────────────────────────

function CenteredNote({ title, body, action }: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div style={{
      textAlign: 'center', padding: '56px 24px', background: c.bgSubtle,
      border: `1px solid ${c.border}`, borderRadius: 4,
    }}>
      <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary, marginBottom: 8 }}>
        {title}
      </div>
      {body && (
        <p style={{ fontSize: 13, color: c.textMuted, margin: '0 auto', maxWidth: 420, lineHeight: 1.6 }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

function Skeletons() {
  const bar = (width: string, height: number): CSSProperties => ({
    width, height, borderRadius: 4, background: c.border, opacity: 0.35,
  })
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: '14px',
          background: c.card, border: `1px solid ${c.border}`, borderRadius: 4,
        }}>
          <div style={bar(i % 2 === 0 ? '40%' : '55%', 14)} />
          <div style={bar('70%', 10)} />
        </div>
      ))}
    </div>
  )
}
