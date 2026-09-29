import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase, storageUrl } from '@/shared/lib/supabase'
import { loadPortfolioSettings } from '@/features/portfolio/portfolioSettings'
import { usePortalLocale } from '@/shared/i18n/portalLocale'
import { PortalShell } from './components/PortalShell'
import { type NavItem } from './components/PortalNav'
import { OverviewScreen } from './components/OverviewScreen'
import { GalleryGrid } from './components/GalleryGrid'
import { type GalleryCardData } from './components/GalleryCard'

const PortfolioEditor = lazy(() => import('@/features/portfolio/PortfolioEditor').then(m => ({ default: m.PortfolioEditor })))

// ─── Types ─────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}

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

// ─── Editorial design tokens (Pic-Time aesthetic) ─────────────────────────
// Same palette + spacing system used throughout Dashboard.tsx so the
// public client view feels like the same product as the photographer admin.
// Retained for the Production module content blocks (Content Studio, Stories)
// that keep their original presentation.
const bg          = '#F2EFE9' // cream canvas
const border      = '#D0D0D0' // hairline 1px
const textPrimary = '#141413' // charcoal
const textSecondary = '#333333'
const textMuted   = '#767470'  // WCAG-AA accessible muted on cream

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''; const v = obj[key]; return typeof v === 'string' ? v : ''
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'galleries' | 'page'>('overview')
  const [signingOut, setSigningOut] = useState(false)
  // Locale drives the whole portal; hooks must precede the early returns.
  const loc = usePortalLocale()

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
      // First image of each gallery is its cover.
      const coverRes = await Promise.all(data.map(async g => {
        const { data: img } = await supabase.from('images').select('thumbnail_path, web_preview_path')
          .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
        return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.web_preview_path) : null }
      }))
      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
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
      const res = await fetch('/api/gallery-access', {
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

  // Sign out a member; also clears legacy PIN session keys.
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

  const galleryCards: GalleryCardData[] = galleries.map(g => ({
    id: g.id,
    name: g.name,
    coverUrl: covers.get(g.id) ?? null,
    imageCount: g.image_count,
    publishedIso: g.published_at,
  }))

  // "My Page" is only offered to production-entitled members.
  const navItems: NavItem[] = [
    { id: 'overview',  label: loc.t('nav.overview'),  icon: 'activity', onSelect: () => setTab('overview') },
    { id: 'galleries', label: loc.t('nav.galleries'), icon: 'sections', onSelect: () => setTab('galleries') },
    ...(productionEnabled ? [{
      id: 'page', label: loc.t('nav.myPage'), icon: 'palette' as const, onSelect: () => setTab('page'),
    }] : []),
  ]

  return (
    <PortalShell
      loc={loc}
      studioName={studioName}
      clientTitle={displayTitle}
      navItems={navItems}
      activeNavId={tab}
      showAccount={memberAuthorized}
      email={memberEmail}
      clientName={activeMembership?.client_name ?? clientName}
      signingOut={signingOut}
      onSignOut={() => { void handleSignOut() }}
    >
      <div dir={loc.dir}>
        {tab === 'overview' && (
          <OverviewScreen
            loc={loc}
            clientName={activeMembership?.client_name || clientName}
            galleries={galleryCards}
            hrefFor={galleryUrl}
            onViewAll={() => setTab('galleries')}
          />
        )}
        {tab === 'galleries' && <GalleryGrid loc={loc} items={galleryCards} hrefFor={galleryUrl} />}
        {tab === 'page' && productionEnabled && (
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
      </div>
    </PortalShell>
  )
}
