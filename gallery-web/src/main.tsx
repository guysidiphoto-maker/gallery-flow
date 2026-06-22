import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { App } from './App'
import './styles.css'
import { initSentry } from './sentry'
import { getSentryReportContext } from './lib/sentryContext'
import { LANDING_PATHS } from '../seo/content'
import { initAnalytics } from './lib/analytics'

// ── Route-level code splitting ───────────────────────────────────────────
// Every non-gallery route is lazy-loaded so the public gallery viewer
// (`App`) — the LCP-critical surface — ships the smallest possible JS.
// Each `React.lazy(...)` becomes its own Rollup chunk; the route is only
// fetched when its path is visited. Wrapping in `Suspense fallback={null}`
// keeps the splash visible until the chunk + its sub-tree are ready (the
// splash lives in index.html and is removed when React renders).
const LandingPageHe = lazy(() =>
  import('./pages/LandingPageHe').then(m => ({ default: m.LandingPageHe })),
)
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then(m => ({ default: m.LandingPage })),
)
const SeoLanding = lazy(() =>
  import('./pages/SeoLanding').then(m => ({ default: m.SeoLanding })),
)
const BlogIndex = lazy(() =>
  import('./pages/BlogIndex').then(m => ({ default: m.BlogIndex })),
)
const BlogPost = lazy(() =>
  import('./pages/BlogPost').then(m => ({ default: m.BlogPost })),
)
const DemoPage = lazy(() =>
  import('./pages/DemoPage').then(m => ({ default: m.DemoPage })),
)
const PricingPage = lazy(() => import('./pages/PricingPage'))
const TermsPage = lazy(() =>
  import('./pages/TermsPage').then(m => ({ default: m.TermsPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })),
)
const PortfolioPage = lazy(() =>
  import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })),
)
const ClientDashboard = lazy(() =>
  import('./pages/ClientDashboard').then(m => ({ default: m.ClientDashboard })),
)
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then(m => ({ default: m.Dashboard })),
)
const VendorPortal = lazy(() =>
  import('./pages/VendorPortal').then(m => ({ default: m.VendorPortal })),
)
const EventCapturePage = lazy(() =>
  import('./pages/EventCapturePage').then(m => ({ default: m.EventCapturePage })),
)
const QuestionnairePage = lazy(() =>
  import('./pages/QuestionnairePage').then(m => ({ default: m.QuestionnairePage })),
)
const StudioSettings = lazy(() =>
  import('./pages/StudioSettings').then(m => ({ default: m.StudioSettings })),
)
const BrandKit = lazy(() =>
  import('./pages/BrandKit').then(m => ({ default: m.BrandKit })),
)

initSentry()
// Analytics is a no-op unless VITE_GA4_MEASUREMENT_ID is set (see lib/analytics).
initAnalytics()

// ── Global ErrorBoundary ─────────────────────────────────────────────────
// Catches uncaught render errors anywhere in the tree (e.g. lazy-chunk fetch
// failures after a deploy, asset hash mismatches, runtime exceptions). Without
// this, those produce a blank page; here we show a Hebrew RTL fallback panel
// styled to match the index.html splash, and report the error to Sentry.
interface ErrorBoundaryState {
  hasError: boolean
  eventId: string | null
  copied: boolean
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, eventId: null, copied: false }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Wrap in try/catch so a Sentry SDK failure can't recurse into the boundary.
    let eventId: string | null = null
    try {
      eventId = Sentry.captureException(error, { extra: { errorInfo } }) ?? null
    } catch {
      // Last-resort: log to console; don't rethrow.
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary failed to report to Sentry', error)
    }
    this.setState({ eventId })
  }

  // Copy the Sentry event id + a short context blob (user, gallery, url,
  // ua, timestamp) so the user can paste it straight into a support email.
  // Without the event id, support has to time-correlate logs to user reports
  // — with it, we open the event in Sentry directly.
  handleCopyReport = async (): Promise<void> => {
    const ctx = getSentryReportContext()
    const blob = [
      `Sentry Event ID: ${ctx.eventId ?? this.state.eventId ?? 'n/a'}`,
      `Timestamp:       ${ctx.timestamp}`,
      `URL:             ${ctx.url}`,
      `User ID:         ${ctx.user.id ?? 'n/a'}`,
      `Gallery ID:      ${ctx.gallery.id ?? 'n/a'}`,
      `Gallery slug:    ${ctx.gallery.slug ?? 'n/a'}`,
      `Gallery status:  ${ctx.gallery.status ?? 'n/a'}`,
      `User Agent:      ${ctx.userAgent}`,
    ].join('\n')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(blob)
      } else {
        // Fallback for browsers without async clipboard (older Safari etc).
        const ta = document.createElement('textarea')
        ta.value = blob
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2400)
    } catch {
      // Clipboard blocked (iframe / permissions) — show the blob in a prompt
      // so the user can manually copy. Less elegant but never silently fails.
      try { window.prompt('העתק את הטקסט הבא ושלח אלינו במייל:', blob) } catch { /* noop */ }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const { eventId, copied } = this.state
    return (
      <div
        dir="rtl"
        style={{
          position: 'fixed', inset: 0,
          background: '#0a0a0f',
          color: 'rgba(255,255,255,.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          fontFamily: 'Heebo, Inter, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 32, fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
              color: '#fafafa',
            }}
          >
            התרחשה שגיאה
          </h1>
          <p
            style={{
              fontSize: 14, lineHeight: 1.6,
              color: 'rgba(255,255,255,.6)',
              margin: '0 0 28px',
            }}
          >
            נסה לרענן את הדף. אם זה לא נפתר, פנה אלינו.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 22px',
                fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
                fontFamily: 'inherit',
                background: '#D4FF00', color: '#000',
                border: 'none', borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              רענן דף
            </button>
            <button
              onClick={this.handleCopyReport}
              style={{
                padding: '12px 22px',
                fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
                fontFamily: 'inherit',
                background: copied ? 'rgba(212,255,0,.15)' : 'transparent',
                color: 'rgba(255,255,255,.85)',
                border: '1px solid rgba(255,255,255,.25)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'background .2s, border-color .2s',
              }}
            >
              {copied ? 'הועתק' : 'העתק דיווח'}
            </button>
          </div>
          {eventId && (
            <p
              style={{
                marginTop: 18,
                fontSize: 11,
                color: 'rgba(255,255,255,.35)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                letterSpacing: '.02em',
                wordBreak: 'break-all',
              }}
            >
              {eventId}
            </p>
          )}
        </div>
      </div>
    )
  }
}

function Router() {
  const path = window.location.pathname

  if (path === '/') return <LandingPageHe />
  if (path === '/en' || path === '/en/') return <LandingPage />
  // Content-driven SEO landing pages (single source: seo/content.ts). Single
  // segment, so they precede the multi-segment gallery matchers below.
  if (LANDING_PATHS.has(path.replace(/\/+$/, '') || '/')) return <SeoLanding />
  // Blog — /blog index and /blog/<slug> posts. Two-segment posts must be
  // matched here, before the multi-segment gallery matchers below.
  if (path === '/blog' || path === '/blog/') return <BlogIndex />
  if (path.startsWith('/blog/')) return <BlogPost />
  if (path === '/demo') return <DemoPage />
  if (path === '/pricing') return <PricingPage />
  if (path === '/dashboard') return <Dashboard />
  if (path === '/studio-settings') return <StudioSettings />
  if (path === '/brand-kit') return <BrandKit />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
  // Questionnaire
  if (path.startsWith('/q/')) return <QuestionnairePage />
  // Event lead capture (QR landing)
  if (path.startsWith('/event/')) return <EventCapturePage />
  // Vendor portal
  if (path.startsWith('/vendor/') || /^\/[^/]+\/vendor\//.test(path)) return <VendorPortal />
  // Client dashboard (authenticated) — short slug form: /<biz>/c/<client-slug>
  if (/^\/[^/]+\/c\/[^/]+\/?$/.test(path)) return <ClientDashboard />
  // Client dashboard — legacy UUID forms.
  if (/\/client\/[^/]+\/dashboard/.test(path)) return <ClientDashboard />
  // Client public page → Portfolio (auto-generated website)
  if (path.startsWith('/client/') || /^\/[^/]+\/client\//.test(path)) return <PortfolioPage />
  if (path.startsWith('/gallery') || /^\/[^/]+\/gallery\//.test(path)) return <App />
  // Short gallery URL: /<biz>/g/<gallery-slug>[/<section-slug>]
  if (/^\/[^/]+\/g\/[^/]+(?:\/[^/]+)?\/?$/.test(path)) return <App />
  // Clean gallery URL: /{business-slug}/{gallery-slug}[/{section-slug}]
  // Section pages (Pixieset-style sets) ride on the same App — the extra
  // segment selects which section page opens.
  if (/^\/[^/]+\/[^/]+(?:\/[^/]+)?\/?$/.test(path)) return <App />

  // Fallback: redirect to landing
  window.location.replace('/')
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.StrictMode>
      <Suspense fallback={null}>
        <Router />
      </Suspense>
    </React.StrictMode>
  </ErrorBoundary>
)
// deploy
