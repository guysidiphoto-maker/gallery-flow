// Owner-side global search over the self-scoped `search_owner_content` RPC.
// RPCs can't be aborted, so stale responses are dropped with a
// sequence guard; photos render thumbnails only (displayUrl).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchOwnerContent } from '@/shared/data/search'
import { cn, Input, WorkspaceView } from '@/shared/ui'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import {
  EMPTY_FILTER_STATE, EMPTY_RESULT,
  buildFilterPayload, createDebouncer, createSequenceGuard,
  isEmptyResult, normalizeSearchResult, shouldSearch,
} from './searchLogic'
import type { SearchFilterState, SearchLocale, SearchResult } from './searchLogic'
import { dirFor, t } from './strings'
import { FilterPanel } from './components/FilterPanel'
import { SearchSection } from './components/SearchSection'
import { ClientRow } from './components/ClientRow'
import { GalleryRow } from './components/GalleryRow'
import { ImageCard } from './components/ImageCard'
import { CenteredNote } from './components/CenteredNote'
import { SearchSkeletons } from './components/SearchSkeletons'

const DEBOUNCE_MS = 300

export interface GlobalSearchProps {
  /** Open a gallery in the Dashboard's in-page gallery view. */
  onOpenGallery: (galleryId: string) => void
  /** Open a client (Clients Manager detail). */
  onOpenClient: (clientId: string) => void
  /** UI language; defaults to Hebrew. */
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
        const { data, error } = await searchOwnerContent(query.trim(), payload)
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
  const { t: ownerT } = useOwnerLocale()

  return (
    <WorkspaceView dir={dir} eyebrow={ownerT('nav.workspace')} title={tr('search.title')} description={tr('search.subtitle')}>

      {/* Search input */}
      <div className="mb-3 flex items-center gap-2.5">
        <Input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tr('search.placeholder')}
          aria-label={tr('search.title')}
          className="h-11 flex-1 rounded-[4px] py-0 text-[15px]"
        />
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={cn(
            'h-11 cursor-pointer rounded-[4px] border px-4 text-[13px] whitespace-nowrap',
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

      {phase === 'loading' && <SearchSkeletons />}

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
            <SearchSection title={tr('search.section.clients')} count={result.clients.length}>
              {result.clients.map(hit => (
                <ClientRow key={hit.id} hit={hit} locale={locale} onOpen={onOpenClient} />
              ))}
            </SearchSection>
          )}
          {result.galleries.length > 0 && (
            <SearchSection title={tr('search.section.galleries')} count={result.galleries.length}>
              {result.galleries.map(hit => (
                <GalleryRow key={hit.id} hit={hit} locale={locale} onOpen={onOpenGallery} />
              ))}
            </SearchSection>
          )}
          {result.images.length > 0 && (
            <SearchSection
              title={tr('search.section.images')}
              count={result.images.length}
              note={result.images.length >= 60 ? tr('search.imagesCap') : undefined}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
                {result.images.map(hit => (
                  <ImageCard key={hit.id} hit={hit} locale={locale} onOpen={onOpenGallery} />
                ))}
              </div>
            </SearchSection>
          )}
        </div>
      )}
    </WorkspaceView>
  )
}
