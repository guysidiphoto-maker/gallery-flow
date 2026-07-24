import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { supabase, storageUrl } from '../supabase'
import { signedStorageUrl } from '../lib/signedStorage'
import { SignedImg } from '../components/SignedImg'
// Heavy panels are only rendered when their tab is active. Lazy-loading
// them strips ~220KB (html2canvas + jsPDF in TenderBuilder, plus the rest
// of PortfolioEditor + SocialManager) from the initial bundle most clients
// land on. The settings utility (loadPortfolioSettings) lives in a
// dependency-free file so the eager import below stays light.
const TenderBuilder    = lazy(() => import('../components/TenderBuilder').then(m => ({ default: m.TenderBuilder })))
const SocialManager    = lazy(() => import('../components/SocialManager').then(m => ({ default: m.SocialManager })))
const PortfolioEditor  = lazy(() => import('../components/PortfolioEditor').then(m => ({ default: m.PortfolioEditor })))
const FeedStudio       = lazy(() => import('../components/FeedStudio').then(m => ({ default: m.FeedStudio })))
const CreativeEngineDialog = lazy(() => import('../components/CreativeEngineDialog').then(m => ({ default: m.CreativeEngineDialog })))
import { loadPortfolioSettings } from '../components/portfolioSettings'
import { Icon } from '../components/Icon'
import { usePortalLocale } from '../lib/portalLocale'
import { SOCIAL_STUDIO_ENABLED } from '../lib/features'
import SocialComingSoon from '../components/social-lock/SocialComingSoon'
import { PortalShell } from '../components/portal/PortalShell'
import { type NavItem } from '../components/portal/PortalNav'
import { OverviewScreen } from '../components/portal/OverviewScreen'
import { GalleryGrid } from '../components/portal/GalleryGrid'
import { type GalleryCardData } from '../components/portal/GalleryCard'
const ClientHome = lazy(() => import('../components/ClientHome').then(m => ({ default: m.ClientHome })))

// PR1 — "Social OS" simplified navigation (Dashboard / Social Studio / Library).
// Behind a flag so the legacy 7-tab structure stays fully recoverable: when the
// flag is off, the client dashboard renders exactly as before. Enable per-env
// (e.g. Vercel preview) with VITE_FEATURE_NEW_IA=true.
const SOCIAL_OS = import.meta.env.VITE_FEATURE_NEW_IA === 'true'

// ─── Types ─────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}
interface ImageRow {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null; is_top_pick: boolean
}
interface StoryRow { id: string; gallery_id: string; style: string; storage_path: string }

// ─── Client Portal V2 — authenticated bootstrap contract ────────────────────
// Self-scoped RPC: resolves auth.uid() → active memberships + published
// galleries. Takes NO arguments; disabled/revoked members get empty arrays.
interface PortalMembership {
  membership_id: string
  client_id: string
  business_id: string
  client_name: string
  client_slug: string | null
  role: string
  production_suite: boolean
}
interface PortalBootstrap {
  authenticated: boolean
  memberships: PortalMembership[]
  galleries: Array<Record<string, unknown>>
}
function isPortalBootstrap(v: unknown): v is PortalBootstrap {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.authenticated === 'boolean'
    && Array.isArray(o.memberships) && Array.isArray(o.galleries)
}

// The Production / social suite tabs. Shown only when the active membership's
// `production_suite === true`. The legacy PIN path has no membership, so it
// resolves to false → these are hidden.
const PRODUCTION_TABS = ['feed-studio', 'content', 'calendar', 'tender', 'stories'] as const

// ─── Editorial design tokens (Pic-Time aesthetic) ─────────────────────────
// Same palette + spacing system used throughout Dashboard.tsx so the
// public client view feels like the same product as the photographer admin.
// Retained for the Production module content blocks (Content Studio, Stories)
// that keep their original presentation.
const bg          = '#F2EFE9' // cream canvas
const bgSubtle    = '#FAF9F5' // section panels
const border      = '#D0D0D0' // hairline 1px
const textPrimary = '#141413' // charcoal
const textSecondary = '#333333'
const textMuted   = '#767470'  // WCAG-AA accessible muted on cream

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''; const v = obj[key]; return typeof v === 'string' ? v : ''
}

// ─── Scroll Reveal ─────────────────────────────────────────────────────────

function useReveal() {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)'
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })
    }
    el.style.opacity = '0'; el.style.transform = 'translateY(20px)'
    el.style.transition = 'opacity .5s ease, transform .5s ease'
    obs.current.observe(el)
  }, [])
}

// ─── Download Helper ───────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Story Player ──────────────────────────────────────────────────────────
// Story player stays dark on purpose — full-screen video lightbox feels
// most natural over a near-black scrim, not over cream.

function StoryPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <video src={url} autoPlay controls playsInline onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '85vh' }} />
      <button onClick={onClose} aria-label="Close" style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        background: 'transparent', border: '1px solid rgba(255,255,255,.4)',
        borderRadius: 2, color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="close" size={16} strokeWidth={1.85} />
      </button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ClientDashboard() {
  // Parse URL — supports four shapes:
  //   /eclipse-media/c/pro-market                ← short, slug-based (NEW)
  //   /eclipse-media/client/<uuid>/dashboard     ← legacy UUID
  //   /eclipse-media/client/<uuid>               ← legacy without /dashboard
  //   /client/<uuid>                             ← root-level legacy
  const parsedUrl = (() => {
    const path = window.location.pathname.replace(/\/dashboard\/?$/, '').replace(/\/$/, '')
    // Short slug form: /<businessSlug>/c/<clientSlug>
    const shortMatch = path.match(/^\/([^/]+)\/c\/([^/]+)$/)
    if (shortMatch) return { slug: shortMatch[1], clientSlug: shortMatch[2], clientId: '' }
    // Legacy UUID forms (clientId is a UUID).
    const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
    if (slugMatch) return { slug: slugMatch[1], clientSlug: '', clientId: slugMatch[2] }
    const directMatch = path.match(/^\/client\/([^/]+)$/)
    if (directMatch) return { slug: '', clientSlug: '', clientId: directMatch[1] }
    return { slug: '', clientSlug: '', clientId: '' }
  })()
  const slug = parsedUrl.slug

  // We need a UUID `clientId` for all existing queries. Resolve from the
  // slug-based URL via a one-time lookup; legacy UUID URLs already give us
  // the UUID directly. When a UUID URL is loaded, we look up the client's
  // slug in the background and rewrite the address bar to the short form
  // (replaceState — no navigation, no re-render) so the user copies a
  // shareable link.
  const [clientId, setClientId] = useState<string>(parsedUrl.clientId)
  const [resolveErr, setResolveErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (clientId) {
      // Legacy UUID URL — canonicalize to short form in the URL bar. Resolves
      // slugs through the membership-gated SECURITY DEFINER resolver: the
      // owner-scoped `businesses`/`clients` tables are unreadable under the
      // member session, and this never leaks slugs to a non-member.
      ;(async () => {
        const { data, error: e } = await supabase.rpc('resolve_client_portal_by_id', { p_client_id: clientId })
        if (cancelled || e) return
        const row = Array.isArray(data) ? data[0] : null
        if (!row?.business_slug || !row?.client_slug) return
        const newUrl = `/${row.business_slug}/c/${row.client_slug}`
        if (window.location.pathname !== newUrl) {
          window.history.replaceState(null, '', newUrl + window.location.search + window.location.hash)
        }
      })()
      return () => { cancelled = true }
    }
    if (!parsedUrl.slug || !parsedUrl.clientSlug) return
    ;(async () => {
      // Short-URL resolution via the membership-gated SECURITY DEFINER resolver.
      // Returns a row ONLY when the current member actively belongs to the
      // resolved client — a non-member (or unknown slugs) gets no rows, so the
      // caller learns nothing about businesses/clients they don't belong to.
      const { data, error: e } = await supabase.rpc('resolve_client_portal', {
        p_business_slug: parsedUrl.slug,
        p_client_slug: parsedUrl.clientSlug,
      })
      if (cancelled) return
      const row = !e && Array.isArray(data) ? data[0] : null
      if (!row?.client_id) { setResolveErr('Business not found'); return }
      setClientId(row.client_id)
    })()
    return () => { cancelled = true }
  }, [parsedUrl.slug, parsedUrl.clientSlug, clientId])

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => {
    return sessionStorage.getItem(`client-dash-${clientId}`) === 'true'
  })

  // ── Client Portal V2 authenticated path ──────────────────────────────────
  // When a Supabase session exists AND client_portal_bootstrap returns an
  // ACTIVE membership for the resolved clientId, that membership is the
  // authorization + entitlement source — it REPLACES the legacy PIN/route-trust
  // gate. `memberAuthorized` short-circuits the PIN gates below; the active
  // membership drives Production-tab gating. Un-upgraded clients (no membership)
  // fall through to the legacy PIN gate, which is already fail-closed.
  const [bootstrap, setBootstrap] = useState<PortalBootstrap | null>(null)
  const [bootstrapChecked, setBootstrapChecked] = useState(false)
  const [memberEmail, setMemberEmail] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { setBootstrap(null); setBootstrapChecked(true); return }
        setMemberEmail(session.user.email ?? null)
        const { data, error: e } = await supabase.rpc('client_portal_bootstrap')
        if (cancelled) return
        setBootstrap(!e && isPortalBootstrap(data) ? data : null)
      } catch {
        if (!cancelled) setBootstrap(null)
      } finally {
        if (!cancelled) setBootstrapChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Active membership for the CURRENTLY-resolved clientId (server-verified —
  // bootstrap is self-scoped via auth.uid(), never trusts the route param).
  const activeMembership =
    clientId && bootstrap?.authenticated
      ? bootstrap.memberships.find(m => m.client_id === clientId) ?? null
      : null
  // An authenticated member with an active membership for THIS client. This is
  // the only condition that bypasses the legacy PIN gate.
  const memberAuthorized = activeMembership !== null
  // Production/social suite entitlement. Default deny: only true when the active
  // membership explicitly carries production_suite. Legacy PIN path → false.
  const productionEnabled = activeMembership?.production_suite === true
  // Feature availability (contract C1): the Social/Production studio renders
  // ONLY when the global feature flag AND the entitlement are both true. The
  // flag is off in every environment today, so this is false for everyone —
  // entitled members included. Entitlement architecture stays intact above.
  const socialAllowed = SOCIAL_STUDIO_ENABLED && productionEnabled

  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [clientCode, setClientCode] = useState('')

  // Token expiry awareness — if the previously-issued session token is past
  // its server-side expiry, drop the cached "authenticated" flag so the gate
  // re-prompts on next visit. Runs once per clientId resolution.
  useEffect(() => {
    if (!clientId) return
    try {
      const expRaw = sessionStorage.getItem(`client-token-expires-${clientId}`)
      if (expRaw) {
        // The backend returns a TIMESTAMPTZ which serializes to an ISO string
        // (e.g., "2026-06-08T15:30:00+00:00"). new Date(...) parses both ISO
        // and numeric (ms) safely; we keep both interpretations valid.
        const expMs = new Date(expRaw).getTime()
        if (Number.isFinite(expMs) && expMs < Date.now()) {
          sessionStorage.removeItem(`client-dash-${clientId}`)
          sessionStorage.removeItem(`client-token-${clientId}`)
          sessionStorage.removeItem(`client-token-expires-${clientId}`)
          setAuthenticated(false)
        }
      }
    } catch { /* ignore */ }
  }, [clientId])

  // State
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [topPicks, setTopPicks] = useState<ImageRow[]>([])
  const [allImages, setAllImages] = useState<ImageRow[]>([])
  const [stories, setStories] = useState<Map<string, StoryRow[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'home' | 'feed-studio' | 'content' | 'calendar' | 'galleries' | 'stories' | 'page' | 'tender'>(SOCIAL_OS ? 'home' : 'feed-studio')
  const [signingOut, setSigningOut] = useState(false)

  // ── Client Portal V2 presentation state ──────────────────────────────────
  // Locale (he default / en) drives the entire interface — never mixed. Called
  // here with the other hooks so the value is available to the loading/gate
  // screens below (hooks must precede the early returns).
  const loc = usePortalLocale()
  // Presentation-only Overview flag for NON-ENTITLED clients. Their `tab` is
  // pinned to a gated-safe value ('galleries') by the preserved redirect guard,
  // so `home` (a Production tab) cannot back a non-entitled Overview. This flag
  // toggles between MY Overview screen and the Galleries screen WITHOUT touching
  // `tab` or the entitlement guard. Entitled clients ignore it (they use `tab`).
  const [nonEntitledOverview, setNonEntitledOverview] = useState(true)
  // Presentation state for the LOCKED Social Studio nav item (feature flag
  // off). Selecting it shows the Coming-soon panel — never the studio. Like
  // `nonEntitledOverview` it NEVER touches `tab`, so the redirect guard keeps
  // `tab` pinned to a safe value the whole time.
  const [socialLockOpen, setSocialLockOpen] = useState(false)

  // Production-tab safety: the non-SOCIAL_OS default tab is 'feed-studio' (a
  // Production tab). Once we know the entitlement, if Production is disabled and
  // the active tab is a Production module, redirect to a safe section so the
  // module never renders. Runs whenever entitlement or tab changes.
  useEffect(() => {
    if (!bootstrapChecked) return
    // 'home' is the content-engine (Production) dashboard; treat it as gated too.
    // Gated on `socialAllowed` (flag AND entitlement): with the feature flag
    // off, even entitled members are redirected out of every Production tab.
    if (!socialAllowed && ((PRODUCTION_TABS as readonly string[]).includes(tab) || tab === 'home')) {
      setTab('galleries')
    }
  }, [bootstrapChecked, socialAllowed, tab])
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(() => {
    // Hydrate from sessionStorage so the user's selection survives refresh
    // within the same browser session. Real persistence (a
    // `client_post_selections` table) is Phase 3+ work.
    try {
      const raw = sessionStorage.getItem('selectedPicks-' + clientId)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
      }
    } catch { /* ignore */ }
    return new Set()
  })
  const [playingStory, setPlayingStory] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [creativeGallery, setCreativeGallery] = useState<{ id: string; name: string; topPicksCount: number } | null>(null)
  const reveal = useReveal()

  // Re-hydrate selectedPicks from sessionStorage when the active client
  // changes (initial state ran with possibly-stale clientId on the very
  // first render). Empty set if no key exists yet — the data loader will
  // seed from photographer top picks.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('selectedPicks-' + clientId)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          setSelectedPicks(new Set(arr.filter((x): x is string => typeof x === 'string')))
          return
        }
      }
      setSelectedPicks(new Set())
    } catch {
      setSelectedPicks(new Set())
    }
  }, [clientId])

  // ── Load data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) {
      // Slug-based URL but resolution hasn't finished or it failed.
      if (resolveErr) { setError(resolveErr); setLoading(false) }
      // Otherwise stay in loading state until clientId resolves.
      return
    }
    load()
    async function load() {
      const { data, error: e } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live')
        .order('published_at', { ascending: false })
      if (e || !data?.length) { setError(e ? 'Could not load' : 'No galleries found'); setLoading(false); return }
      setGalleries(data)
      // Extract client code from first gallery's settings
      const s = (data[0].delivery_settings || {}) as Record<string, unknown>
      if (typeof s.clientCode === 'string' && s.clientCode) setClientCode(s.clientCode)
      const ids = data.map(g => g.id)

      // PostgREST alias: the actual column is `web_preview_path`, but the
      // ImageRow type + every render call site refers to it as
      // `storage_path`. Keep the wire query honest while preserving the
      // existing type contract — same pattern used in Dashboard.tsx.
      const [coverRes, picksRes, allRes, storiesRes] = await Promise.all([
        Promise.all(data.map(async g => {
          const { data: img } = await supabase.from('images').select('thumbnail_path, storage_path:web_preview_path')
            .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
          return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.storage_path) : null }
        })),
        supabase.from('images').select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).eq('is_top_pick', true).order('sort_order', { ascending: true }).limit(120),
        supabase.from('images').select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).order('sort_order', { ascending: true }),
        supabase.from('stories').select('id, gallery_id, style, storage_path').in('gallery_id', ids),
      ])

      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
      if (picksRes.data) setTopPicks(picksRes.data)
      if (allRes.data) setAllImages(allRes.data)

      // Initialize selected picks with photographer's top picks — but only
      // if the user doesn't already have a session-persisted selection.
      if (picksRes.data) {
        const existing = sessionStorage.getItem('selectedPicks-' + clientId)
        if (!existing) {
          const seeded = new Set(picksRes.data.map(p => p.id))
          setSelectedPicks(seeded)
          try {
            sessionStorage.setItem('selectedPicks-' + clientId, JSON.stringify(Array.from(seeded)))
          } catch { /* ignore quota */ }
        }
      }

      if (storiesRes.data?.length) {
        const sm = new Map<string, StoryRow[]>()
        await Promise.all(storiesRes.data.map(async s => {
          try {
            const r = await fetch(storageUrl('gallery-stories', s.storage_path), { method: 'HEAD' })
            if (r.ok) { const arr = sm.get(s.gallery_id) || []; arr.push(s); sm.set(s.gallery_id, arr) }
          } catch {}
        }))
        setStories(sm)
      }
      setLoading(false)
    }
  }, [clientId, resolveErr])

  // ── Helpers ────────────────────────────────────────────────────────────

  // Hold the render until the authenticated bootstrap check resolves — without
  // this, a valid member would briefly see the PIN/"access restricted" gate
  // before bootstrap confirms their membership. Only gate on this while the user
  // is NOT already cached as authenticated via the legacy path.
  if (!bootstrapChecked && !authenticated) return (
    <div dir={loc.dir} style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `2px solid ${border}`,
          borderTopColor: textPrimary, borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{
          fontSize: 11, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{loc.t('loading')}</p>
      </div>
    </div>
  )

  if (loading) return (
    <div dir={loc.dir} style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `2px solid ${border}`,
          borderTopColor: textPrimary, borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{
          fontSize: 11, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{loc.t('loading')}</p>
      </div>
    </div>
  )
  if (error) return (
    <div dir={loc.dir} style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit',
    }}>
      <div style={{
        textAlign: 'center', padding: '40px 36px',
        background: '#fff', border: `1px solid ${border}`,
        maxWidth: 420,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 14,
        }}>{loc.t('error.title')}</div>
        <p style={{ fontSize: 15, color: textPrimary, margin: 0, lineHeight: 1.5 }}>{error}</p>
      </div>
    </div>
  )

  // ── Server-issued session token ────────────────────────────────────────
  // Phase 3 introduces hashed `access_code_hash` + per-attempt rate limiting.
  // The endpoint replies in three shapes:
  //   1. `{ ok, token, expires_at }`        → migrated client, hashed PIN ok
  //   2. `{ ok, fallback_to_legacy: true }` → not yet migrated, do plaintext
  //   3. `{ error: 'cooldown_active', cooldown_until }` → 429 throttled
  // Anything else is a generic invalid-code response. `submitting` blocks
  // double-submits and drives the loading label on the Enter button.
  async function tryUnlock() {
    setSubmitting(true)
    setCodeError(null)
    try {
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_code', clientId, code: codeInput }),
      })
      const json = await res.json().catch(() => ({} as Record<string, unknown>))
      if (json.ok && json.token) {
        // New flow: hashed PIN, server-issued token.
        sessionStorage.setItem(`client-token-${clientId}`, String(json.token))
        sessionStorage.setItem(`client-token-expires-${clientId}`, String(json.expires_at))
        sessionStorage.setItem(`client-dash-${clientId}`, 'true')
        setAuthenticated(true)
        return
      }
      if (json.ok && json.fallback_to_legacy) {
        // Migration not yet run for this client. Fall back to plain-text compare.
        if (codeInput === clientCode) {
          sessionStorage.setItem(`client-dash-${clientId}`, 'true')
          setAuthenticated(true)
          return
        }
        setCodeError('קוד שגוי')
        return
      }
      if (json.error === 'cooldown_active') {
        const until = new Date(String(json.cooldown_until))
        const mins = Math.ceil((until.getTime() - Date.now()) / 60000)
        setCodeError(`יותר מדי ניסיונות שגויים. נסה שוב בעוד ${mins} דקות.`)
        return
      }
      setCodeError('קוד שגוי')
    } catch {
      setCodeError('שגיאת רשת. נסה שוב.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Code gate ──────────────────────────────────────────────────────────
  // Authenticated members with an active membership skip the PIN entirely —
  // their server-verified membership is the authorization.
  if (!authenticated && !memberAuthorized && clientCode) {
    return (
      <div dir="rtl" style={{
        minHeight: '100vh', background: bg, color: textPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 440, padding: '48px 40px',
          background: '#fff', border: `1px solid ${border}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 18,
          }}>Client Dashboard</div>
          <h2 style={{
            fontSize: 26, fontWeight: 500, margin: '0 0 12px',
            letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.15,
          }}>הזינו קוד גישה</h2>
          <p style={{
            fontSize: 14, color: textSecondary, margin: '0 0 32px', lineHeight: 1.55,
          }}>
            הקוד נמצא במייל שקיבלת מהצלם
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(null) }}
              placeholder="CODE"
              autoFocus
              disabled={submitting}
              onKeyDown={e => {
                if (e.key === 'Enter' && !submitting) { void tryUnlock() }
              }}
              style={{
                flex: 1, padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
                color: textPrimary, background: '#fff',
                border: `1px solid ${codeError ? '#dc2626' : border}`,
                borderRadius: 2, outline: 'none', letterSpacing: '0.18em',
                textAlign: 'center', textTransform: 'uppercase',
                transition: 'border-color .15s',
                opacity: submitting ? 0.6 : 1,
              }}
              onFocus={e => { if (!codeError) e.currentTarget.style.borderColor = textPrimary }}
              onBlur={e => { if (!codeError) e.currentTarget.style.borderColor = border }}
            />
            <button
              onClick={() => { void tryUnlock() }}
              disabled={submitting}
              style={{
                padding: '12px 24px', borderRadius: 2,
                background: textPrimary, border: `1px solid ${textPrimary}`,
                color: '#fff', fontSize: 11, fontWeight: 500,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                opacity: submitting ? 0.7 : 1,
              }}
            >{submitting ? 'מאמת...' : 'Enter'}</button>
          </div>
          {codeError && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 12, fontWeight: 500 }}>
              {codeError}
            </p>
          )}
          <a
            href={slug ? `/${slug}/client/${clientId}` : `/client/${clientId}`}
            style={{
              display: 'inline-block', marginTop: 28,
              fontSize: 11, color: textMuted, textDecoration: 'none',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              transition: 'color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = textPrimary }}
            onMouseLeave={e => { e.currentTarget.style.color = textMuted }}
          >View public page →</a>
        </div>
      </div>
    )
  }

  // ── Fail-closed guard (Client Portal V2) ─────────────────────────────────
  // SECURITY: a legacy client with NO configured access code previously
  // rendered the portal OPEN here — the coded gate above only triggers when
  // `clientCode` is truthy, so an empty/absent clientCode silently bypassed
  // authentication (audit finding). Reaching this point means loading+error are
  // already handled and the user is NOT authenticated. Missing access
  // configuration must fail CLOSED, not open. Coded clients (gate above) and
  // authenticated sessions are unaffected. New clients use authenticated
  // `client_memberships` access instead of a PIN.
  //
  // Client Portal V2: an authenticated member with an active membership for this
  // client (memberAuthorized) is allowed through here — the legacy fail-closed
  // block only applies to un-upgraded clients with neither a PIN nor a
  // membership. A logged-in user without a membership for THIS client still
  // fails closed (memberAuthorized === false).
  if (!authenticated && !memberAuthorized && !clientCode) {
    return (
      <div dir={loc.dir} style={{
        minHeight: '100vh', background: bg, color: textPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 440, padding: '48px 40px',
          background: '#fff', border: `1px solid ${border}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 18,
          }}>{loc.t('portal.badge')}</div>
          <h2 style={{
            fontSize: 26, fontWeight: 500, margin: '0 0 12px',
            letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.15,
          }}>{loc.t('gate.restricted.title')}</h2>
          <p style={{
            fontSize: 14, color: textSecondary, margin: '0 0 8px', lineHeight: 1.55,
          }}>
            {loc.t('gate.restricted.body')}
          </p>
        </div>
      </div>
    )
  }

  const first = galleries[0]
  const deliverySettings = (first.delivery_settings || {}) as Record<string, unknown>
  const studioName = readStr(deliverySettings, 'studioName')
  const clientName = first.client_name || readStr(deliverySettings, 'clientName') || 'Dashboard'
  const portfolioSettings = loadPortfolioSettings(clientId)
  const displayTitle = portfolioSettings.pageTitle || clientName
  const galleryUrl = (id: string) => slug ? `/${slug}/gallery/${id}` : `/gallery/${id}`
  const hasStories = stories.size > 0

  const togglePick = (id: string) => {
    setSelectedPicks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try {
        sessionStorage.setItem('selectedPicks-' + clientId, JSON.stringify(Array.from(next)))
      } catch { /* ignore quota */ }
      return next
    })
  }

  const selectedImages = allImages.filter(img => selectedPicks.has(img.id))

  // Log out an authenticated member. Clears any legacy session cache too so a
  // stale PIN flag can't re-open the dashboard, then routes to the login page.
  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch { /* fall through to redirect regardless */ }
    try {
      sessionStorage.removeItem(`client-dash-${clientId}`)
      sessionStorage.removeItem(`client-token-${clientId}`)
      sessionStorage.removeItem(`client-token-expires-${clientId}`)
    } catch { /* ignore */ }
    window.location.href = '/client-login'
  }

  // ── Client Portal V2 navigation model ────────────────────────────────────
  // The information architecture is driven ENTIRELY by `productionEnabled`.
  //
  //   Non-entitled client: Overview · Galleries        (Account lives in shell)
  //   Entitled client:     Overview · Galleries · Content Library ·
  //                        Social Studio · Content Calendar · My Page
  //
  // Production areas map onto the EXISTING gated `tab` content blocks — nothing
  // is rebuilt. Production nav items are appended ONLY when `productionEnabled`,
  // so a non-entitled client can NEVER see a Production entry point. The
  // preserved redirect guard keeps `tab` on a safe value for non-entitled
  // clients; their Overview↔Galleries switch is presentation-only
  // (`nonEntitledOverview`) and never touches `tab`.

  // Gallery data adapted for the new card components. Covers may be absent (the
  // common case in the test env) — GalleryCard/CoverFallback handle that.
  const galleryCards: GalleryCardData[] = galleries.map(g => ({
    id: g.id,
    name: g.name,
    coverUrl: covers.get(g.id) ?? null,
    imageCount: g.image_count,
    publishedIso: g.published_at,
  }))

  // Which nav item is visually active.
  const activeNavId: string = socialAllowed
    ? (tab === 'home' ? 'overview'
      : tab === 'galleries' ? 'galleries'
      : tab === 'content' ? 'library'
      : (tab === 'feed-studio' || tab === 'calendar') ? (tab === 'calendar' ? 'calendar' : 'social')
      : tab === 'page' ? 'mypage'
      : 'overview')
    : (socialLockOpen ? 'social'
      : nonEntitledOverview ? 'overview'
      : tab === 'page' ? 'mypage'
      : 'galleries')

  // Selecting a non-entitled area is presentation-only; `tab` stays put.
  const goOverview = () => {
    if (socialAllowed) { setTab('home'); return }
    setSocialLockOpen(false); setNonEntitledOverview(true)
  }
  const goGalleries = () => { setSocialLockOpen(false); setNonEntitledOverview(false); setTab('galleries') }

  // Contract C1 navigation:
  //   flag ON + entitled  → full Production nav (prior behavior).
  //   flag OFF (everyone) → Overview · Galleries · Social Studio (LOCKED,
  //                         "Coming soon", opens a panel, never the studio)
  //                         · My Page only for entitled members (not Social).
  //   flag ON + not entitled → Overview · Galleries (prior behavior).
  const navItems: NavItem[] = socialAllowed
    ? [
        { id: 'overview',  label: loc.t('nav.overview'),        icon: 'activity', onSelect: () => setTab('home') },
        { id: 'galleries', label: loc.t('nav.galleries'),       icon: 'sections', onSelect: () => setTab('galleries') },
        { id: 'library',   label: loc.t('nav.contentLibrary'),  icon: 'gallery',  onSelect: () => setTab('content') },
        { id: 'social',    label: loc.t('nav.socialStudio'),    icon: 'stories',  onSelect: () => setTab('feed-studio') },
        { id: 'calendar',  label: loc.t('nav.calendar'),        icon: 'calendar', onSelect: () => setTab('calendar') },
        { id: 'mypage',    label: loc.t('nav.myPage'),          icon: 'palette',  onSelect: () => setTab('page') },
      ]
    : [
        { id: 'overview',  label: loc.t('nav.overview'),  icon: 'activity', onSelect: goOverview },
        { id: 'galleries', label: loc.t('nav.galleries'), icon: 'sections', onSelect: goGalleries },
        ...(!SOCIAL_STUDIO_ENABLED ? [{
          id: 'social',
          label: `${loc.t('nav.socialStudio')} · ${loc.t('nav.comingSoon')}`,
          icon: 'stories' as const,
          onSelect: () => { setNonEntitledOverview(false); setSocialLockOpen(true) },
        }] : []),
        ...(productionEnabled ? [{
          id: 'mypage',
          label: loc.t('nav.myPage'),
          icon: 'palette' as const,
          onSelect: () => { setSocialLockOpen(false); setNonEntitledOverview(false); setTab('page') },
        }] : []),
      ]

  // Whether to render the presentation-only Overview screen instead of the
  // Galleries screen. Applies to every client while `socialAllowed` is false
  // (today: everyone). The Coming-soon panel takes over the content area when
  // the locked Social item is selected.
  const showNonEntitledOverview = !socialAllowed && nonEntitledOverview && !socialLockOpen
  const showSocialLock = !socialAllowed && socialLockOpen

  return (
    <PortalShell
      loc={loc}
      studioName={studioName}
      clientTitle={displayTitle}
      navItems={navItems}
      activeNavId={activeNavId}
      showAccount={memberAuthorized}
      email={memberEmail}
      clientName={activeMembership?.client_name ?? clientName}
      signingOut={signingOut}
      onSignOut={() => { void handleSignOut() }}
    >
    <div dir={loc.dir}>

        {/* ── Overview (non-entitled clients) ──────────────────────────────
            Presentation-only Overview backed by `nonEntitledOverview`. Never a
            Production surface — a simple, honest welcome + galleries. */}
        {showNonEntitledOverview && (
          <OverviewScreen
            loc={loc}
            clientName={activeMembership?.client_name || clientName}
            galleries={galleryCards}
            hrefFor={galleryUrl}
            onViewAll={goGalleries}
          />
        )}

        {/* ── Social Studio locked (feature flag off, contract C1) ─────────
            An elegant Coming-soon panel. Presentation-only: `tab` stays on a
            safe value, no studio module mounts, no Instagram flow reachable. */}
        {showSocialLock && (
          <SocialComingSoon loc={loc} onGoGalleries={goGalleries} />
        )}

        {/* ── Production module unavailable (defensive) ────────────────────
            If a Production tab is somehow active without the entitlement (e.g.
            a transient state before the redirect effect fires, or a tampered
            value), render a safe notice instead of the Production module. The
            module content blocks are ALSO individually gated on
            `productionEnabled`, so they never mount here. */}
        {bootstrapChecked && !socialAllowed && !showNonEntitledOverview && !showSocialLock && (PRODUCTION_TABS as readonly string[]).includes(tab) && (
          <div style={{
            padding: '48px 40px', textAlign: 'center',
            background: '#fff', border: `1px solid ${border}`, maxWidth: 480, margin: '0 auto',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
              color: textMuted, textTransform: 'uppercase', marginBottom: 14,
            }}>{loc.t('gate.notAvailable.badge')}</div>
            <p style={{ fontSize: 15, color: textPrimary, margin: '0 0 6px', lineHeight: 1.5 }}>
              {loc.t('gate.notAvailable.title')}
            </p>
            <p style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
              {loc.t('gate.notAvailable.body')}
            </p>
          </div>
        )}

        {/* ── Overview (entitled clients) — personalized content-engine home ──
            Production-gated: only entitled businesses see this surface. */}
        {tab === 'home' && socialAllowed && (
          <Suspense fallback={<div style={{ padding: 96, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>{loc.t('loading')}…</div>}>
            <ClientHome
              loc={loc}
              clientName={activeMembership?.client_name || clientName}
              galleries={galleries}
              covers={covers}
              galleryHref={galleryUrl}
              onGoSocial={() => setTab('feed-studio')}
              onGoLibrary={() => setTab('galleries')}
            />
          </Suspense>
        )}

        {/* ── Feed Studio Tab — the AI Visual OS surface (Production) ──── */}
        {tab === 'feed-studio' && socialAllowed && (
          <Suspense fallback={<div style={{ padding: 96, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>Loading Feed Studio…</div>}>
            <FeedStudio
              clientId={clientId}
              topPicks={topPicks}
              galleries={galleries}
            />
          </Suspense>
        )}

        {/* ── Content Studio Tab (Production) ─────────────────────────── */}
        {tab === 'content' && socialAllowed && (
          <div>
            {/* Stats bar — single hairline-bordered grid row */}
            <div ref={reveal} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 0, marginBottom: 56,
              border: `1px solid ${border}`, background: bgSubtle,
            }}>
              {[
                { label: 'Selected', value: selectedPicks.size },
                { label: 'Top Picks', value: topPicks.length },
                { label: 'Galleries', value: galleries.length },
                { label: 'Stories', value: Array.from(stories.values()).flat().length },
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: '24px 28px',
                  borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                }}>
                  <div style={{
                    fontSize: 11, color: textMuted, fontWeight: 500,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    marginBottom: 14,
                  }}>{stat.label}</div>
                  <div style={{
                    fontSize: 28, fontWeight: 400, color: textPrimary,
                    letterSpacing: '-0.025em', lineHeight: 1,
                    fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  }}>{stat.value.toLocaleString('he-IL')}</div>
                </div>
              ))}
            </div>

            {/* Section: Instagram Posts */}
            <div ref={reveal} style={{ marginBottom: 56 }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                marginBottom: 24, gap: 16, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                    color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                  }}>For Instagram</div>
                  <h2 style={{
                    fontSize: 26, fontWeight: 500, margin: '0 0 6px',
                    letterSpacing: '-0.02em', color: textPrimary,
                  }}>Posts</h2>
                  <p style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
                    Click to select / deselect · Download ready-to-post images
                  </p>
                </div>
                {selectedPicks.size > 0 && (
                  <button
                    onClick={async () => {
                      setDownloading('all')
                      for (const img of selectedImages.slice(0, 20)) {
                        const url = await signedStorageUrl('gallery-images', img.storage_path)
                        await downloadImage(url, `post_${img.filename}`)
                        await new Promise(r => setTimeout(r, 300))
                      }
                      setDownloading(null)
                    }}
                    style={{
                      padding: '11px 22px', borderRadius: 2,
                      background: textPrimary, border: `1px solid ${textPrimary}`,
                      color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit',
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Icon name="download" size={13} strokeWidth={1.85} />
                    {downloading === 'all' ? 'Downloading…' : `Download ${selectedPicks.size}`}
                  </button>
                )}
              </div>

              {/* Instagram grid — Pixieset-tight packing, no card wrappers */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
              }}>
                {allImages.filter(img => img.is_top_pick || selectedPicks.has(img.id)).slice(0, 60).map(img => {
                  const selected = selectedPicks.has(img.id)
                  const gallery = galleries.find(g => g.id === img.gallery_id)
                  return (
                    <div
                      key={img.id}
                      onClick={() => togglePick(img.id)}
                      style={{
                        aspectRatio: '1', overflow: 'hidden', position: 'relative',
                        cursor: 'pointer', background: bgSubtle,
                        outline: selected ? `2px solid ${textPrimary}` : 'none',
                        outlineOffset: selected ? -2 : 0,
                      }}
                    >
                      <SignedImg
                        bucket="gallery-images"
                        path={img.thumbnail_path || img.storage_path}
                        alt="" loading="lazy"
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          opacity: selected ? 1 : 0.45,
                          transition: 'opacity .15s',
                        }}
                      />
                      {/* Selection chip — circular cream/charcoal */}
                      <div style={{
                        position: 'absolute', top: 8, insetInlineEnd: 8,
                        width: 22, height: 22, borderRadius: '50%',
                        background: selected ? textPrimary : 'rgba(255,255,255,.85)',
                        border: `1.5px solid ${selected ? textPrimary : 'rgba(255,255,255,.95)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background .15s',
                        color: '#fff',
                      }}>
                        {selected && <Icon name="check" size={11} strokeWidth={3} />}
                      </div>
                      {/* Gallery label — bottom strip */}
                      {gallery && (
                        <div style={{
                          position: 'absolute', bottom: 0, insetInline: 0,
                          background: 'linear-gradient(to top, rgba(20,20,19,.7), transparent)',
                          padding: '20px 10px 8px',
                          fontSize: 10, fontWeight: 500, color: '#fff',
                          letterSpacing: '0.04em',
                        }}>
                          {gallery.name}
                        </div>
                      )}
                      {/* Per-tile download — only when selected, on hover */}
                      {selected && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            setDownloading(img.id)
                            const url = await signedStorageUrl('gallery-images', img.storage_path)
                            await downloadImage(url, `post_${img.filename}`)
                            setDownloading(null)
                          }}
                          aria-label="Download"
                          style={{
                            position: 'absolute', bottom: 8, insetInlineStart: 8,
                            width: 26, height: 26, borderRadius: '50%',
                            background: 'rgba(255,255,255,.9)', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: textPrimary, padding: 0,
                          }}
                        >
                          <Icon name="download" size={12} strokeWidth={1.85} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Browse more from galleries — quiet horizontal chip row */}
              <div style={{
                marginTop: 28, padding: '20px 22px',
                background: bgSubtle, border: `1px solid ${border}`,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase', marginBottom: 14,
                }}>Browse more</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {galleries.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setTab('galleries')}
                      style={{
                        flexShrink: 0, padding: '8px 16px', borderRadius: 2,
                        background: '#fff', border: `1px solid ${border}`,
                        color: textPrimary, fontSize: 11, fontFamily: 'inherit',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        letterSpacing: '0.04em', fontWeight: 500,
                        transition: 'border-color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                    >
                      {g.name} · {g.image_count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Story Reels */}
            {hasStories && (
              <div ref={reveal} style={{ marginBottom: 56 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                }}>For Stories</div>
                <h2 style={{
                  fontSize: 26, fontWeight: 500, margin: '0 0 6px',
                  letterSpacing: '-0.02em', color: textPrimary,
                }}>Story Reels</h2>
                <p style={{ fontSize: 13, color: textSecondary, margin: '0 0 24px', lineHeight: 1.5 }}>
                  Download and share on Instagram Stories
                </p>
                <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                  {galleries.filter(g => stories.has(g.id)).map(g => {
                    const cover = covers.get(g.id)
                    const galleryStories = stories.get(g.id) || []
                    return (
                      <div key={g.id} style={{ flexShrink: 0, width: 140 }}>
                        {/* Phone-shaped preview */}
                        <div
                          onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                          style={{
                            aspectRatio: '9 / 16', overflow: 'hidden',
                            border: `1px solid ${border}`, cursor: 'pointer',
                            background: bgSubtle, position: 'relative',
                            transition: 'border-color .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                        >
                          {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'rgba(255,255,255,.92)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: textPrimary,
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div style={{
                          marginTop: 10, fontSize: 12, fontWeight: 500, color: textPrimary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{g.name}</div>
                        <button
                          onClick={async () => {
                            setDownloading(g.id)
                            const url = storageUrl('gallery-stories', galleryStories[0].storage_path)
                            await downloadImage(url, `story_${g.name.replace(/\s+/g, '_')}.mp4`)
                            setDownloading(null)
                          }}
                          style={{
                            marginTop: 8, width: '100%', padding: '8px 0',
                            background: 'transparent', border: `1px solid ${border}`,
                            borderRadius: 2, color: textPrimary,
                            fontSize: 10, fontWeight: 500,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            fontFamily: 'inherit', cursor: 'pointer',
                            transition: 'border-color .15s, background .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary; e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                        >
                          {downloading === g.id ? 'Downloading…' : 'Download'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Content Calendar Tab (Production) ────────────────────── */}
        {tab === 'calendar' && socialAllowed && (
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
            <SocialManager
              galleries={galleries}
              allImages={allImages}
              topPicks={topPicks}
              clientId={clientId}
              storageUrl={storageUrl}
            />
          </Suspense>
        )}

        {/* ── Galleries Tab ───────────────────────────────────────────── */}
        {tab === 'galleries' && !showNonEntitledOverview && !showSocialLock && (
          <GalleryGrid
            loc={loc}
            items={galleryCards}
            hrefFor={galleryUrl}
          />
        )}

        {/* ── Stories Tab ──────────────────────────────────────────────── */}
        {tab === 'stories' && hasStories && socialAllowed && (
          <div>
            <div ref={reveal} style={{ marginBottom: 32 }}>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase', marginBottom: 10,
              }}>Reels</div>
              <h2 style={{
                fontSize: 28, fontWeight: 500, margin: '0 0 6px',
                letterSpacing: '-0.02em', color: textPrimary,
              }}>Stories</h2>
              <p style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
                Preview and download your story reels
              </p>
            </div>
            <div ref={reveal} style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 24,
            }}>
              {galleries.filter(g => stories.has(g.id)).map(g => {
                const cover = covers.get(g.id)
                const galleryStories = stories.get(g.id) || []
                return (
                  <div key={g.id} style={{ textAlign: 'center' }}>
                    <div
                      onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                      style={{
                        aspectRatio: '9 / 16', overflow: 'hidden',
                        border: `1px solid ${border}`, cursor: 'pointer',
                        background: bgSubtle, position: 'relative',
                        transition: 'border-color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                    >
                      {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />}
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: 'rgba(255,255,255,.92)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: textPrimary,
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
                        </div>
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, insetInline: 0,
                        background: 'linear-gradient(to top, rgba(20,20,19,.78), transparent)',
                        padding: '24px 14px 14px', textAlign: 'right',
                      }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: '#fff',
                          letterSpacing: '-0.01em',
                        }}>{g.name}</div>
                        <div style={{
                          fontSize: 11, fontWeight: 500, letterSpacing: '0.18em',
                          textTransform: 'uppercase', color: 'rgba(255,255,255,.9)', marginTop: 4,
                        }}>{galleryStories.length} {galleryStories.length === 1 ? 'story' : 'stories'}</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setDownloading(g.id)
                        for (const s of galleryStories) {
                          await downloadImage(storageUrl('gallery-stories', s.storage_path), `story_${g.name.replace(/\s+/g, '_')}_${s.style}.mp4`)
                        }
                        setDownloading(null)
                      }}
                      style={{
                        marginTop: 12, padding: '10px 20px', borderRadius: 2,
                        background: 'transparent', border: `1px solid ${textPrimary}`,
                        color: textPrimary,
                        fontSize: 10, fontWeight: 500,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background .15s, color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                    >
                      {downloading === g.id ? 'Downloading…' : 'Download Stories'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── My Page Tab ─────────────────────────────────────────────── */}
        {tab === 'page' && (
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
            <PortfolioEditor
              clientId={clientId}
              clientName={clientName}
              studioName={studioName}
              galleries={galleries}
              covers={covers}
              publicUrl={`https://pixflow-ai.com/${slug}/client/${clientId}`}
            />
          </Suspense>
        )}

        {/* ── Tender Tab (Production) ─────────────────────────────────── */}
        {tab === 'tender' && socialAllowed && (
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
            <TenderBuilder
              galleries={galleries}
              allImages={allImages}
              covers={covers}
              businessName={studioName || 'Studio'}
            />
          </Suspense>
        )}
      {/* Story player */}
      {playingStory && <StoryPlayer url={playingStory} onClose={() => setPlayingStory(null)} />}

      {/* Creative Engine — per-gallery AI design campaign */}
      {creativeGallery && (
        <Suspense fallback={null}>
          <CreativeEngineDialog
            clientId={clientId}
            galleryId={creativeGallery.id}
            galleryName={creativeGallery.name}
            topPicksCount={creativeGallery.topPicksCount}
            imageById={new Map(topPicks.map(p => [p.id, { id: p.id, thumbnail_path: p.thumbnail_path, storage_path: p.storage_path }]))}
            onClose={() => setCreativeGallery(null)}
          />
        </Suspense>
      )}
    </div>
    </PortalShell>
  )
}
