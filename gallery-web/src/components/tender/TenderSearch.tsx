// TenderSearch — owner-side tender library (Overnight 2026-07-24, contract C6).
//
// Metadata-first search over the owner's OWN archive:
//   • gallery-level results come from the self-scoped search_owner_content RPC
//     (contract C5, migration 098 — built concurrently by Agent-SEARCH). The
//     browser NEVER queries galleries cross-tenant directly for search.
//   • image-level results (inside a chosen gallery) use the existing owner
//     read patterns: images of own galleries are owner-readable under RLS,
//     image_ai_scores has public read (migration 052).
//   • match reasons are computed from returned fields — which filters matched.
//     NO invented relevance scores. image ordering may use the REAL existing
//     hero_score, labeled "מבוסס על ציון AI קיים / Based on existing AI score".
//   • selections go into tender_collections / tender_collection_items
//     (migration 100) directly under owner-scoped RLS.
//
// Visual language mirrors TenderBuilder.tsx (dark glass surface, indigo/violet
// accents) — that component is client-facing and untouched.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { SignedImg } from '../SignedImg'
import {
  EVENT_TYPES, EVENT_SIZE_BUCKETS, VENUE_TYPES, TIMES_OF_DAY,
  computeMatchReasons, hasCollectionItem, type TenderFilters,
} from './metadata'
import {
  listCollections, createCollection, renameCollection, listItems, addItem, removeItem,
  buildCopyList, type TenderCollection, type TenderCollectionItem,
} from './collections'
import { MetadataEnrichment, type GalleryMetadataValues } from './MetadataEnrichment'
import { t, dirFor, type Locale, type TenderKey } from './strings'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GalleryResult {
  id: string
  name: string
  slug: string | null
  status: string | null
  image_count: number | null
  client_id: string | null
  client_name: string | null
  event_date: string | null
  event_type: string | null
  event_location: string | null
  event_size_bucket: string | null
  industry: string | null
  venue_type: string | null
  time_of_day: string | null
  event_keywords: string[]
  match_reason: string[]
}

interface ImageRow {
  id: string
  gallery_id: string
  filename: string | null
  thumbnail_path: string | null
  web_preview_path: string | null
  is_top_pick: boolean
  sort_order: number | null
  width: number | null
  height: number | null
}

interface ClientOption { client_id: string; name: string }

type Orientation = 'any' | 'portrait' | 'landscape'

// Defensive normalization: Agent-SEARCH builds the RPC concurrently, so we
// tolerate either `id` or `gallery_id` and missing metadata fields.
function normalizeGallery(raw: Record<string, unknown>): GalleryResult | null {
  const id = typeof raw.id === 'string' ? raw.id
    : typeof raw.gallery_id === 'string' ? raw.gallery_id : null
  if (!id) return null
  const str = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? raw[k] as string : null)
  return {
    id,
    name: str('name') ?? id,
    slug: str('slug'),
    status: str('status'),
    image_count: typeof raw.image_count === 'number' ? raw.image_count : null,
    client_id: str('client_id'),
    client_name: str('client_name'),
    event_date: str('event_date'),
    event_type: str('event_type'),
    event_location: str('event_location'),
    event_size_bucket: str('event_size_bucket'),
    industry: str('industry'),
    venue_type: str('venue_type'),
    time_of_day: str('time_of_day'),
    event_keywords: Array.isArray(raw.event_keywords)
      ? (raw.event_keywords as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    match_reason: Array.isArray(raw.match_reason)
      ? (raw.match_reason as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  }
}

const isUnclassified = (g: GalleryResult) =>
  !g.event_size_bucket && !g.industry && !g.venue_type && !g.time_of_day && g.event_keywords.length === 0

// ─── Shared style tokens (TenderBuilder visual language) ────────────────────

const glassCard: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,.015))',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 16,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}
const sectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.7)',
  letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 7, display: 'block',
}
const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 50, fontSize: 12, fontWeight: 500,
  background: active ? 'linear-gradient(135deg, rgba(99,102,241,.28), rgba(168,85,247,.2))' : 'rgba(255,255,255,.05)',
  color: active ? '#fff' : 'rgba(255,255,255,.75)',
  border: `1px solid ${active ? 'rgba(129,140,248,.45)' : 'rgba(255,255,255,.13)'}`,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
})
const smallBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 500,
  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
  color: 'rgba(255,255,255,.8)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
}
const primaryBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: 'none',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(99,102,241,.35)',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TenderSearch({ locale = 'he' }: { locale?: Locale }) {
  const dir = dirFor(locale)
  const tt = useCallback((k: TenderKey) => t(locale, k), [locale])

  // owner context
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])

  // brief form
  const [query, setQuery] = useState('')
  const [eventType, setEventType] = useState<string | null>(null)
  const [sizeBucket, setSizeBucket] = useState<string | null>(null)
  const [industry, setIndustry] = useState('')
  const [clientId, setClientId] = useState('')
  const [location, setLocation] = useState('')
  const [venueType, setVenueType] = useState<string | null>(null)
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null)
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [keywordsText, setKeywordsText] = useState('')

  // results
  const [results, setResults] = useState<GalleryResult[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const abortRef = useRef<AbortController | null>(null)

  // image drill-in
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [images, setImages] = useState<ImageRow[]>([])
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [imagesLoading, setImagesLoading] = useState(false)
  const [orientation, setOrientation] = useState<Orientation>('any')

  // classify editor
  const [classifyId, setClassifyId] = useState<string | null>(null)

  // collections
  const [collections, setCollections] = useState<TenderCollection[]>([])
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [items, setItems] = useState<TenderCollectionItem[]>([])
  const [collectionsError, setCollectionsError] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // gallery id → provenance for the panel + copy export
  const galleryMetaRef = useRef(new Map<string, { name: string; clientName: string | null }>())

  const activeCollection = collections.find(c => c.id === activeCollectionId) ?? null

  // ── bootstrap: own business + client options + collections ────────────────
  useEffect(() => {
    void (async () => {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id
      if (!uid) return
      const { data: biz } = await supabase
        .from('businesses').select('id').eq('user_id', uid).maybeSingle()
      if (biz?.id) setBusinessId(biz.id as string)

      const { data: cl } = await supabase.rpc('cpv2_owner_clients_overview')
      if (Array.isArray(cl)) {
        setClients(cl
          .filter((r: Record<string, unknown>) => typeof r.client_id === 'string' && typeof r.name === 'string')
          .map((r: Record<string, unknown>) => ({ client_id: r.client_id as string, name: r.name as string })))
      }

      const { data: cols, error } = await listCollections()
      if (error) { setCollectionsError(true); return }
      setCollections(cols)
      if (cols.length > 0) setActiveCollectionId(cols[0].id)
    })()
  }, [])

  // ── active collection items ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCollectionId) { setItems([]); return }
    void (async () => {
      const { data } = await listItems(activeCollectionId)
      setItems(data)
      // resolve names for galleries we have not seen in results
      const missing = [...new Set(data.map(i => i.gallery_id))]
        .filter(id => !galleryMetaRef.current.has(id))
      if (missing.length > 0) {
        const { data: gs } = await supabase
          .from('galleries').select('id, name').in('id', missing)
        for (const g of (gs ?? []) as { id: string; name: string }[]) {
          galleryMetaRef.current.set(g.id, { name: g.name, clientName: null })
        }
        setItems(prev => [...prev]) // re-render with names
      }
    })()
  }, [activeCollectionId])

  // ── search (debounced 300ms, abortable) ────────────────────────────────────
  const filters: TenderFilters = useMemo(() => ({
    event_type: eventType ?? undefined,
    event_size_bucket: sizeBucket ?? undefined,
    industry: industry.trim() || undefined,
    client_id: clientId || undefined,
    location: location.trim() || undefined,
    venue_type: venueType ?? undefined,
    time_of_day: timeOfDay ?? undefined,
    year_from: /^\d{4}$/.test(yearFrom) ? Number(yearFrom) : undefined,
    year_to: /^\d{4}$/.test(yearTo) ? Number(yearTo) : undefined,
    keywords: keywordsText.split(',').map(s => s.trim()).filter(Boolean),
  }), [eventType, sizeBucket, industry, clientId, location, venueType, timeOfDay, yearFrom, yearTo, keywordsText])

  const hasCriteria = query.trim() !== ''
    || !!filters.event_type || !!filters.event_size_bucket || !!filters.industry
    || !!filters.client_id || !!filters.location || !!filters.venue_type
    || !!filters.time_of_day || !!filters.year_from || !!filters.year_to
    || (filters.keywords?.length ?? 0) > 0

  useEffect(() => {
    abortRef.current?.abort()
    if (!hasCriteria) { setResults([]); setSearchState('idle'); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSearchState('loading')

    const timer = setTimeout(() => {
      void (async () => {
        // C5 filter keys only — `location` is NOT a search_owner_content filter,
        // so it is applied client-side below (and reported as a match reason).
        const pFilters: Record<string, unknown> = {}
        if (filters.client_id) pFilters.client_id = filters.client_id
        if (filters.event_type) pFilters.event_type = filters.event_type
        if (filters.event_size_bucket) pFilters.event_size_bucket = filters.event_size_bucket
        if (filters.industry) pFilters.industry = filters.industry
        if (filters.venue_type) pFilters.venue_type = filters.venue_type
        if (filters.time_of_day) pFilters.time_of_day = filters.time_of_day
        if (filters.year_from) pFilters.year_from = filters.year_from
        if (filters.year_to) pFilters.year_to = filters.year_to
        if (filters.keywords && filters.keywords.length > 0) pFilters.keywords = filters.keywords

        const { data, error } = await supabase
          .rpc('search_owner_content', { p_query: query.trim(), p_filters: pFilters })
          .abortSignal(ctrl.signal)
        if (ctrl.signal.aborted) return
        if (error) { setSearchState('error'); setResults([]); return }

        const payload = (data ?? {}) as { galleries?: unknown }
        const rawGalleries = Array.isArray(payload.galleries) ? payload.galleries : []
        let normalized = rawGalleries
          .map(r => normalizeGallery(r as Record<string, unknown>))
          .filter((g): g is GalleryResult => g !== null)

        if (filters.location) {
          const needle = filters.location.toLowerCase()
          normalized = normalized.filter(g => (g.event_location ?? '').toLowerCase().includes(needle))
        }

        for (const g of normalized) {
          galleryMetaRef.current.set(g.id, { name: g.name, clientName: g.client_name })
        }
        setResults(normalized)
        setSearchState('done')
      })()
    }, 300)

    return () => { clearTimeout(timer); ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, hasCriteria])

  // ── image drill-in (own gallery, owner-readable under RLS) ────────────────
  useEffect(() => {
    if (!expandedId) { setImages([]); setScores(new Map()); return }
    setImagesLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('images')
        .select('id, gallery_id, filename, thumbnail_path, web_preview_path, is_top_pick, sort_order, width, height')
        .eq('gallery_id', expandedId)
        .order('sort_order', { ascending: true })
      const rows = (data ?? []) as ImageRow[]
      setImages(rows)

      // Real existing AI scores (migration 052; public read). Chunked .in().
      const map = new Map<string, number>()
      const ids = rows.map(r => r.id)
      for (let i = 0; i < ids.length; i += 200) {
        const { data: sc } = await supabase
          .from('image_ai_scores').select('image_id, hero_score')
          .in('image_id', ids.slice(i, i + 200))
        for (const s of (sc ?? []) as { image_id: string; hero_score: number }[]) {
          map.set(s.image_id, Number(s.hero_score))
        }
      }
      setScores(map)
      setImagesLoading(false)
    })()
  }, [expandedId])

  const hasScores = scores.size > 0
  const visibleImages = useMemo(() => {
    let list = [...images]
    if (orientation !== 'any') {
      list = list.filter(img => {
        if (!img.width || !img.height) return false
        return orientation === 'portrait' ? img.height > img.width : img.width >= img.height
      })
    }
    if (hasScores) {
      list.sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1))
    }
    return list
  }, [images, orientation, hasScores, scores])

  // ── collection ops ─────────────────────────────────────────────────────────
  const refreshItems = async (collectionId: string) => {
    const { data } = await listItems(collectionId)
    setItems(data)
  }

  const handleCreateCollection = async () => {
    if (!businessId || !newCollectionName.trim()) return
    const { data, error } = await createCollection(businessId, newCollectionName)
    if (error || !data) { setCollectionsError(true); return }
    setCollections(prev => [data, ...prev])
    setActiveCollectionId(data.id)
    setNewCollectionName('')
  }

  const toggleGalleryItem = async (galleryId: string) => {
    if (!activeCollectionId) return
    const existing = items.find(i => i.gallery_id === galleryId && i.image_id === null)
    if (existing) await removeItem(existing.id)
    else await addItem(items, activeCollectionId, galleryId, null)
    await refreshItems(activeCollectionId)
  }

  const toggleImageItem = async (galleryId: string, imageId: string) => {
    if (!activeCollectionId) return
    const existing = items.find(i => i.gallery_id === galleryId && i.image_id === imageId)
    if (existing) await removeItem(existing.id)
    else await addItem(items, activeCollectionId, galleryId, imageId)
    await refreshItems(activeCollectionId)
  }

  const handleRename = async () => {
    if (!activeCollection || !renameText.trim()) { setRenaming(false); return }
    const err = await renameCollection(activeCollection.id, renameText)
    if (!err) {
      setCollections(prev => prev.map(c =>
        c.id === activeCollection.id ? { ...c, name: renameText.trim().slice(0, 120) } : c))
    }
    setRenaming(false)
  }

  const handleCopyList = async () => {
    if (!activeCollection) return
    try {
      const text = await buildCopyList(activeCollection.name, items, galleryMetaRef.current)
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 2500)
  }

  const galleryItemCount = items.filter(i => i.image_id === null).length
  const imageItemCount = items.filter(i => i.image_id !== null).length

  const matchLabel = (reason: string): string => {
    const key = `tender.match.${reason}` as TenderKey
    const v = t(locale, key)
    return v === key ? reason : v
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      direction: dir, padding: '32px 24px 24px', maxWidth: 1440, margin: '0 auto',
      background: '#0a0a0f', color: 'rgba(255,255,255,.9)', borderRadius: 14, position: 'relative',
    }}>
      {/* background glow, same as TenderBuilder */}
      <div style={{
        position: 'absolute', top: 0, right: '10%', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(99,102,241,.08) 0%, transparent 70%)',
        pointerEvents: 'none', filter: 'blur(40px)',
      }} />

      <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ═══ Main column ═══ */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Hero */}
          <div style={{ marginBottom: 22 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px',
              borderRadius: 50, marginBottom: 10,
              background: 'linear-gradient(90deg, rgba(99,102,241,.18), rgba(168,85,247,.18))',
              border: '1px solid rgba(129,140,248,.35)', fontSize: 11, fontWeight: 600, color: '#fff',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8' }} />
              {tt('tender.title')}
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.7)', margin: 0, lineHeight: 1.6 }}>
              {tt('tender.subtitle')}
            </p>
          </div>

          {/* Brief form */}
          <div style={{ ...glassCard, padding: '20px 22px', marginBottom: 22, backdropFilter: 'blur(20px)' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tt('tender.search.placeholder')}
              style={{ ...inputStyle, marginBottom: 16, padding: '12px 14px' }}
            />

            <div style={{ marginBottom: 14 }}>
              <span style={sectionLabel}>{tt('tender.filters.event_type')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EVENT_TYPES.map(et => (
                  <button key={et.key} type="button" style={chip(eventType === et.key)}
                    onClick={() => setEventType(eventType === et.key ? null : et.key)}>
                    {et.icon} {locale === 'he' ? et.he : et.en}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={sectionLabel}>{tt('tender.filters.size')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EVENT_SIZE_BUCKETS.map(b => (
                  <button key={b} type="button" style={chip(sizeBucket === b)}
                    onClick={() => setSizeBucket(sizeBucket === b ? null : b)}>
                    {t(locale, `tender.size.${b}` as TenderKey)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.client')}</span>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none' }}>
                  <option value="">{tt('tender.filters.client.any')}</option>
                  {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.industry')}</span>
                <input type="text" value={industry} onChange={e => setIndustry(e.target.value)}
                  placeholder={tt('tender.filters.industry.placeholder')} style={inputStyle} />
              </div>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.location')}</span>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder={tt('tender.filters.location.placeholder')} style={inputStyle} />
              </div>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.keywords')}</span>
                <input type="text" value={keywordsText} onChange={e => setKeywordsText(e.target.value)}
                  placeholder={tt('tender.filters.keywords.placeholder')} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.venue')}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {VENUE_TYPES.map(v => (
                    <button key={v} type="button" style={chip(venueType === v)}
                      onClick={() => setVenueType(venueType === v ? null : v)}>
                      {t(locale, `tender.venue.${v}` as TenderKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.time')}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {TIMES_OF_DAY.map(v => (
                    <button key={v} type="button" style={chip(timeOfDay === v)}
                      onClick={() => setTimeOfDay(timeOfDay === v ? null : v)}>
                      {t(locale, `tender.time.${v}` as TenderKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span style={sectionLabel}>{tt('tender.filters.years')}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" value={yearFrom} onChange={e => setYearFrom(e.target.value)}
                    placeholder={tt('tender.filters.year_from')} style={{ ...inputStyle, width: 100 }} />
                  <input type="number" value={yearTo} onChange={e => setYearTo(e.target.value)}
                    placeholder={tt('tender.filters.year_to')} style={{ ...inputStyle, width: 100 }} />
                </div>
              </div>
              {hasCriteria && (
                <button type="button" style={{ ...smallBtn, marginInlineStart: 'auto' }} onClick={() => {
                  setQuery(''); setEventType(null); setSizeBucket(null); setIndustry('')
                  setClientId(''); setLocation(''); setVenueType(null); setTimeOfDay(null)
                  setYearFrom(''); setYearTo(''); setKeywordsText('')
                }}>
                  {tt('tender.filters.clear')}
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          {searchState === 'idle' && (
            <div style={{ ...glassCard, padding: '60px 20px', textAlign: 'center', borderStyle: 'dashed' }}>
              <div style={{ fontSize: 30, marginBottom: 8, opacity: .5 }}>🔍</div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.7)' }}>{tt('tender.results.search_hint')}</div>
            </div>
          )}
          {searchState === 'loading' && (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
              {tt('tender.results.loading')}
            </div>
          )}
          {searchState === 'error' && (
            <div style={{ ...glassCard, padding: '40px 20px', textAlign: 'center', borderColor: 'rgba(252,165,165,.3)' }}>
              <div style={{ fontSize: 13.5, color: '#fca5a5' }}>{tt('tender.results.error')}</div>
            </div>
          )}
          {searchState === 'done' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, padding: '0 4px' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{results.length}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
                  {results.length === 1 ? tt('tender.results.one') : tt('tender.results.count')}
                </span>
              </div>
              {results.length === 0 ? (
                <div style={{ ...glassCard, padding: '60px 20px', textAlign: 'center', borderStyle: 'dashed' }}>
                  <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.7)' }}>{tt('tender.results.empty')}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {results.map(g => {
                    const et = EVENT_TYPES.find(e => e.key === g.event_type)
                    const reasons = [...new Set([...g.match_reason, ...computeMatchReasons(g, filters, query)])]
                    const inCollection = hasCollectionItem(items, g.id, null)
                    const galleryImageItems = items.filter(i => i.gallery_id === g.id && i.image_id !== null).length
                    const expanded = expandedId === g.id
                    const classifying = classifyId === g.id
                    return (
                      <div key={g.id} style={{
                        ...glassCard, overflow: 'hidden',
                        borderColor: inCollection || galleryImageItems > 0 ? 'rgba(129,140,248,.35)' : 'rgba(255,255,255,.08)',
                      }}>
                        <div style={{ padding: '16px 18px' }}>
                          {/* title row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                            <span style={{ fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{g.name}</span>
                            {g.status && (
                              <span style={{
                                padding: '2px 9px', borderRadius: 50, fontSize: 10.5, fontWeight: 600,
                                background: g.status === 'live' ? 'rgba(52,211,153,.15)' : 'rgba(255,255,255,.07)',
                                color: g.status === 'live' ? '#6ee7b7' : 'rgba(255,255,255,.65)',
                                border: `1px solid ${g.status === 'live' ? 'rgba(52,211,153,.3)' : 'rgba(255,255,255,.12)'}`,
                              }}>
                                {g.status === 'live' ? tt('tender.gallery.status.live') : tt('tender.gallery.status.draft')}
                              </span>
                            )}
                            {isUnclassified(g) && (
                              <span style={{
                                padding: '2px 9px', borderRadius: 50, fontSize: 10.5, fontWeight: 600,
                                background: 'rgba(251,191,36,.12)', color: '#fcd34d',
                                border: '1px solid rgba(251,191,36,.25)',
                              }}>
                                {tt('tender.unclassified')}
                              </span>
                            )}
                          </div>

                          {/* provenance */}
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            <span>{g.client_name ?? tt('tender.gallery.no_client')}</span>
                            {g.event_date && <span>· {g.event_date}</span>}
                            {et && <span>· {et.icon} {locale === 'he' ? et.he : et.en}</span>}
                            {g.event_location && <span>· {g.event_location}</span>}
                            {typeof g.image_count === 'number' && <span>· {g.image_count} {tt('tender.gallery.images')}</span>}
                          </div>

                          {/* classification badges */}
                          {!isUnclassified(g) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                              {g.event_size_bucket && <Badge text={t(locale, `tender.size.${g.event_size_bucket}` as TenderKey)} />}
                              {g.industry && <Badge text={g.industry} />}
                              {g.venue_type && <Badge text={t(locale, `tender.venue.${g.venue_type}` as TenderKey)} />}
                              {g.time_of_day && <Badge text={t(locale, `tender.time.${g.time_of_day}` as TenderKey)} />}
                              {g.event_keywords.map(k => <Badge key={k} text={`#${k}`} />)}
                            </div>
                          )}

                          {/* match reasons — computed from returned fields, no invented scores */}
                          {reasons.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)' }}>{tt('tender.match.title')}</span>
                              {reasons.map(r => (
                                <span key={r} style={{
                                  padding: '2px 8px', borderRadius: 50, fontSize: 10.5, fontWeight: 600,
                                  background: 'rgba(129,140,248,.14)', color: '#c7d2fe',
                                  border: '1px solid rgba(129,140,248,.25)',
                                }}>
                                  {matchLabel(r)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* actions */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <a href={`/gallery/${g.id}`} target="_blank" rel="noreferrer"
                              style={{ ...smallBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                              {tt('tender.gallery.open')}
                            </a>
                            <button type="button" style={smallBtn}
                              onClick={() => { setClassifyId(classifying ? null : g.id) }}>
                              {tt('tender.classify')}
                            </button>
                            <button type="button"
                              style={inCollection ? { ...smallBtn, borderColor: 'rgba(129,140,248,.4)', color: '#a5b4fc' } : primaryBtn}
                              disabled={!activeCollectionId}
                              onClick={() => void toggleGalleryItem(g.id)}>
                              {inCollection ? tt('tender.gallery.remove_from_collection') : tt('tender.gallery.add_to_collection')}
                            </button>
                            <button type="button" style={smallBtn}
                              onClick={() => { setExpandedId(expanded ? null : g.id); setOrientation('any') }}>
                              {expanded ? tt('tender.gallery.close_images') : tt('tender.gallery.pick_images')}
                            </button>
                            {galleryImageItems > 0 && (
                              <span style={{
                                alignSelf: 'center', padding: '2px 9px', borderRadius: 50,
                                fontSize: 10.5, fontWeight: 700,
                                background: 'linear-gradient(135deg, rgba(99,102,241,.3), rgba(168,85,247,.22))', color: '#fff',
                              }}>
                                {galleryImageItems} {tt('tender.gallery.in_collection')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* classify inline editor */}
                        {classifying && (
                          <MetadataEnrichment
                            galleryId={g.id}
                            locale={locale}
                            values={{
                              event_type: g.event_type, event_location: g.event_location,
                              event_date: g.event_date, event_size_bucket: g.event_size_bucket,
                              industry: g.industry, venue_type: g.venue_type,
                              time_of_day: g.time_of_day, event_keywords: g.event_keywords,
                            }}
                            onSaved={(next: GalleryMetadataValues) => {
                              setResults(prev => prev.map(r => r.id === g.id ? {
                                ...r,
                                event_type: next.event_type, event_location: next.event_location,
                                event_date: next.event_date, event_size_bucket: next.event_size_bucket,
                                industry: next.industry, venue_type: next.venue_type,
                                time_of_day: next.time_of_day, event_keywords: next.event_keywords,
                              } : r))
                            }}
                            onClose={() => setClassifyId(null)}
                          />
                        )}

                        {/* image strip */}
                        {expanded && (
                          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', background: 'rgba(0,0,0,.2)' }}>
                            <div style={{
                              padding: '10px 16px', display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                              borderBottom: '1px solid rgba(255,255,255,.04)',
                            }}>
                              <span style={{ fontSize: 11, color: hasScores ? '#c7d2fe' : 'rgba(255,255,255,.55)', fontWeight: 600 }}>
                                {hasScores ? tt('tender.ai_order') : tt('tender.manual_order')}
                              </span>
                              <div style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'rgba(0,0,0,.3)', borderRadius: 9 }}>
                                {(['any', 'portrait', 'landscape'] as Orientation[]).map(o => (
                                  <button key={o} type="button" onClick={() => setOrientation(o)} style={{
                                    padding: '4px 11px', borderRadius: 7, fontSize: 11, fontWeight: 500, border: 'none',
                                    background: orientation === o ? 'rgba(255,255,255,.12)' : 'transparent',
                                    color: orientation === o ? '#fff' : 'rgba(255,255,255,.65)',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                  }}>
                                    {t(locale, `tender.orientation.${o}` as TenderKey)}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{
                              padding: 12, display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6,
                              maxHeight: 380, overflowY: 'auto',
                            }}>
                              {imagesLoading && (
                                <div style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
                                  {tt('tender.results.loading')}
                                </div>
                              )}
                              {!imagesLoading && visibleImages.map(img => {
                                const sel = hasCollectionItem(items, g.id, img.id)
                                const score = scores.get(img.id)
                                return (
                                  <div key={img.id}
                                    onClick={() => void toggleImageItem(g.id, img.id)}
                                    style={{
                                      position: 'relative', aspectRatio: '3/2', borderRadius: 8,
                                      overflow: 'hidden', cursor: activeCollectionId ? 'pointer' : 'default',
                                      border: `2px solid ${sel ? '#818cf8' : 'transparent'}`,
                                      opacity: sel ? 1 : 0.65, transition: 'all .15s',
                                    }}>
                                    <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.web_preview_path} alt=""
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    {sel && (
                                      <div style={{
                                        position: 'absolute', top: 5, insetInlineEnd: 5, width: 18, height: 18,
                                        borderRadius: 5, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                      </div>
                                    )}
                                    {typeof score === 'number' && (
                                      <div title={tt('tender.ai_order')} style={{
                                        position: 'absolute', bottom: 4, insetInlineStart: 4, fontSize: 9.5,
                                        padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                                        background: 'rgba(0,0,0,.7)', color: '#c7d2fe',
                                      }}>
                                        AI {score.toFixed(1)}
                                      </div>
                                    )}
                                    {img.is_top_pick && (
                                      <div style={{
                                        position: 'absolute', bottom: 4, insetInlineEnd: 4, fontSize: 10,
                                        padding: '1px 5px', borderRadius: 4,
                                        background: 'rgba(0,0,0,.7)', color: '#fbbf24', fontWeight: 700,
                                      }}>★</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ Collection side panel ═══ */}
        <div style={{
          width: 300, flexShrink: 0, position: 'sticky', top: 16,
          ...glassCard, padding: 16, backdropFilter: 'blur(20px)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
            {tt('tender.collection.title')}
          </div>

          {collectionsError && (
            <div style={{ fontSize: 11.5, color: '#fcd34d', marginBottom: 10, lineHeight: 1.5 }}>
              {tt('tender.collection.load_failed')}
            </div>
          )}

          {/* picker + create */}
          {collections.length > 0 && (
            <select
              value={activeCollectionId ?? ''}
              onChange={e => setActiveCollectionId(e.target.value || null)}
              style={{ ...inputStyle, marginBottom: 8, appearance: 'none' }}
              aria-label={tt('tender.collection.select')}
            >
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input
              type="text"
              value={newCollectionName}
              onChange={e => setNewCollectionName(e.target.value)}
              placeholder={tt('tender.collection.new.placeholder')}
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreateCollection() }}
            />
            <button type="button" style={primaryBtn} disabled={!businessId || !newCollectionName.trim()}
              onClick={() => void handleCreateCollection()}>
              {tt('tender.collection.create')}
            </button>
          </div>

          {!activeCollection && !collectionsError && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', lineHeight: 1.6 }}>
              {tt('tender.collection.none')}
            </div>
          )}

          {activeCollection && (
            <>
              {/* name + rename */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {renaming ? (
                  <>
                    <input type="text" value={renameText} onChange={e => setRenameText(e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '6px 9px', fontSize: 12 }}
                      onKeyDown={e => { if (e.key === 'Enter') void handleRename() }} />
                    <button type="button" style={smallBtn} onClick={() => void handleRename()}>
                      {tt('tender.collection.rename.save')}
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeCollection.name}
                    </span>
                    <button type="button" style={{ ...smallBtn, padding: '4px 9px', fontSize: 10.5 }}
                      onClick={() => { setRenameText(activeCollection.name); setRenaming(true) }}>
                      {tt('tender.collection.rename')}
                    </button>
                  </>
                )}
              </div>

              {/* counts */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>
                  <b style={{ color: '#fff', fontSize: 14 }}>{galleryItemCount}</b> {tt('tender.collection.galleries')}
                </span>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>
                  <b style={{ color: '#fff', fontSize: 14 }}>{imageItemCount}</b> {tt('tender.collection.images')}
                </span>
              </div>

              {/* items */}
              {items.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.6, marginBottom: 12 }}>
                  {tt('tender.collection.empty')}
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                  {items.map(it => {
                    const meta = galleryMetaRef.current.get(it.gallery_id)
                    return (
                      <div key={it.id} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '6px 9px', borderRadius: 8,
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meta?.name ?? it.gallery_id}
                          </div>
                          <div style={{ fontSize: 10, color: it.image_id ? 'rgba(255,255,255,.55)' : '#a5b4fc' }}>
                            {it.image_id ? `1 ${tt('tender.collection.images')}` : tt('tender.collection.whole_gallery')}
                          </div>
                        </div>
                        <button type="button"
                          title={tt('tender.collection.remove')}
                          onClick={() => void (async () => {
                            await removeItem(it.id)
                            if (activeCollectionId) await refreshItems(activeCollectionId)
                          })()}
                          style={{
                            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                            color: 'rgba(255,255,255,.6)', borderRadius: 6, width: 20, height: 20,
                            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* copy list export (plain text, no PDF tonight) */}
              <button type="button" style={{ ...primaryBtn, width: '100%', padding: '9px 14px' }}
                disabled={items.length === 0}
                onClick={() => void handleCopyList()}>
                {copyState === 'copied' ? tt('tender.collection.copied')
                  : copyState === 'failed' ? tt('tender.collection.copy_failed')
                  : tt('tender.collection.copy')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Badge({ text }: { text: string }) {
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 50, fontSize: 10.5, fontWeight: 500,
      background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.8)',
      border: '1px solid rgba(255,255,255,.12)',
    }}>
      {text}
    </span>
  )
}

export default TenderSearch
