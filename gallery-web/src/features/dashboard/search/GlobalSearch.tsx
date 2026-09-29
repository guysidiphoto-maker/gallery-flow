// Owner-side global search over the self-scoped `search_owner_content` RPC.
// supabase.rpc can't be aborted, so stale responses are dropped with a
// sequence guard; photos render thumbnails only (displayUrl).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, displayUrl } from '@/shared/lib/supabase'
import { cn, Input, Select } from '@/shared/ui'
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
    <div dir={dir} className="mx-auto max-w-[960px] text-ink">
      {/* Header */}
      <div className="mb-5">
        <h2 className="mb-1.5 text-[26px] font-medium tracking-[-0.02em]">
          {tr('search.title')}
        </h2>
        <p className="text-[13px] text-muted">{tr('search.subtitle')}</p>
      </div>

      {/* Search input */}
      <div className="mb-3 flex items-center gap-2.5">
        <Input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tr('search.placeholder')}
          aria-label={tr('search.title')}
          className="flex-1 rounded-[4px] py-3 text-[15px]"
        />
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={cn(
            'cursor-pointer rounded-[4px] border px-4 py-[11px] text-[13px] whitespace-nowrap',
            showFilters || activeFilterCount > 0 ? 'border-ink bg-ink text-surface' : 'border-line bg-raised text-ink',
          )}
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
              className="cursor-pointer rounded-[4px] border border-ink bg-transparent px-[18px] py-[9px] text-[13px] text-ink"
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
        <div className="flex flex-col gap-7">
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
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

  const field = 'rounded-[4px] px-2.5 py-2 text-[13px]'
  const label = 'mb-[5px] block text-[11px] font-medium tracking-[0.06em] text-muted uppercase'

  return (
    <div className="mb-[18px] rounded-[4px] border border-line bg-surface p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
        {clientOptions.length > 0 && (
          <label>
            <span className={label}>{tr('filter.client')}</span>
            <Select className={field} value={filters.clientId}
              onChange={e => set('clientId', e.target.value)}>
              <option value="">{tr('filter.any')}</option>
              {clientOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </Select>
          </label>
        )}
        <label>
          <span className={label}>{tr('filter.status')}</span>
          <Select className={field} value={filters.status}
            onChange={e => set('status', e.target.value as SearchFilterState['status'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="live">{tr('filter.status.live')}</option>
            <option value="draft">{tr('filter.status.draft')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.assigned')}</span>
          <Select className={field} value={filters.assigned}
            onChange={e => set('assigned', e.target.value as SearchFilterState['assigned'])}>
            <option value="all">{tr('filter.any')}</option>
            <option value="yes">{tr('filter.assigned.yes')}</option>
            <option value="no">{tr('filter.assigned.no')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.eventType')}</span>
          <Input className={field} type="text" value={filters.eventType} maxLength={60}
            placeholder={tr('filter.eventType.ph')}
            onChange={e => set('eventType', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.size')}</span>
          <Select className={field} value={filters.eventSizeBucket}
            onChange={e => set('eventSizeBucket', e.target.value as SearchFilterState['eventSizeBucket'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="intimate">{tr('filter.size.intimate')}</option>
            <option value="small">{tr('filter.size.small')}</option>
            <option value="medium">{tr('filter.size.medium')}</option>
            <option value="large">{tr('filter.size.large')}</option>
            <option value="massive">{tr('filter.size.massive')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.industry')}</span>
          <Input className={field} type="text" value={filters.industry} maxLength={60}
            placeholder={tr('filter.industry.ph')}
            onChange={e => set('industry', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.venue')}</span>
          <Select className={field} value={filters.venueType}
            onChange={e => set('venueType', e.target.value as SearchFilterState['venueType'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="indoor">{tr('filter.venue.indoor')}</option>
            <option value="outdoor">{tr('filter.venue.outdoor')}</option>
            <option value="mixed">{tr('filter.venue.mixed')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.time')}</span>
          <Select className={field} value={filters.timeOfDay}
            onChange={e => set('timeOfDay', e.target.value as SearchFilterState['timeOfDay'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="day">{tr('filter.time.day')}</option>
            <option value="night">{tr('filter.time.night')}</option>
            <option value="mixed">{tr('filter.time.mixed')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.yearFrom')}</span>
          <Input className={field} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearFrom} placeholder="2024"
            onChange={e => set('yearFrom', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.yearTo')}</span>
          <Input className={field} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearTo} placeholder="2026"
            onChange={e => set('yearTo', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.keywords')}</span>
          <Input className={field} type="text" value={filters.keywords}
            placeholder={tr('filter.keywords.ph')}
            onChange={e => set('keywords', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.imported')}</span>
          <Select className={field} value={filters.importedSource}
            onChange={e => set('importedSource', e.target.value as SearchFilterState['importedSource'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="pixieset">{tr('filter.imported.pixieset')}</option>
            <option value="generic_csv">{tr('filter.imported.generic_csv')}</option>
            <option value="local_folder">{tr('filter.imported.local_folder')}</option>
          </Select>
        </label>
      </div>
      <div className="mt-3.5 text-end">
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER_STATE)}
          disabled={!hasActiveFilters(buildFilterPayload(filters))}
          className="cursor-pointer rounded-[4px] border border-line bg-transparent px-3.5 py-2 text-xs text-ink-soft"
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
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
          {title}
        </h3>
        <span className="text-xs text-muted">{count}</span>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function MatchChips({ reasons, locale }: { reasons: string[]; locale: SearchLocale }) {
  if (reasons.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted">{t(locale, 'search.matched')}</span>
      {reasons.map(reason => (
        <span key={reason} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
          {t(locale, matchReasonStringKey(reason))}
        </span>
      ))}
    </span>
  )
}

const row =
  'flex w-full cursor-pointer items-center gap-3.5 rounded-[4px] border border-line bg-surface px-3.5 py-3 text-start text-ink'

function ClientRow({ hit, locale, onOpen }: {
  hit: ClientHit
  locale: SearchLocale
  onOpen: (clientId: string) => void
}) {
  return (
    <button type="button" className={row} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openClient')}: ${hit.name}`}>
      <span className="flex-1 text-sm font-medium">{hit.name}</span>
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
    <button type="button" className={row} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openGallery')}: ${hit.name}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{hit.name}</span>
          {(hit.status === 'live' || hit.status === 'draft') && (
            <span
              className={cn(
                'rounded-full border px-2 py-px text-[11px]',
                hit.status === 'live' ? 'border-sage text-sage' : 'border-line text-muted',
              )}
            >
              {t(locale, hit.status === 'live' ? 'search.status.live' : 'search.status.draft')}
            </span>
          )}
        </span>
        {meta && (
          <span className="mt-[3px] block truncate text-xs text-muted">
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
      className={cn(row, 'flex-col items-stretch gap-2 p-2.5')}>
      <span className="block aspect-[3/2] w-full overflow-hidden rounded-[3px] bg-surface">
        {thumbUrl && (
          <img src={thumbUrl} alt={hit.filename} loading="lazy"
            className="block size-full object-cover" />
        )}
      </span>
      <span className="truncate text-start text-xs text-ink [direction:ltr]">
        {hit.filename}
      </span>
      {hit.gallery_name && (
        <span className="truncate text-[11px] text-muted">
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
    <div className="rounded-[4px] border border-line bg-surface px-6 py-14 text-center">
      <div className="mb-2 text-[17px] font-medium text-ink">
        {title}
      </div>
      {body && (
        <p className="mx-auto max-w-[420px] text-[13px] leading-[1.6] text-muted">
          {body}
        </p>
      )}
      {action && <div className="mt-[18px]">{action}</div>}
    </div>
  )
}

function Skeletons() {
  const bar = 'rounded-[4px] bg-line opacity-35'
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex flex-col gap-2 rounded-[4px] border border-line bg-surface p-3.5">
          <div className={cn(bar, 'h-3.5', i % 2 === 0 ? 'w-2/5' : 'w-[55%]')} />
          <div className={cn(bar, 'h-2.5 w-[70%]')} />
        </div>
      ))}
    </div>
  )
}
