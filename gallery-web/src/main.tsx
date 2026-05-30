import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { App } from './App'
import { LandingPageHe } from './pages/LandingPageHe'
import { DemoPage } from './pages/DemoPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ClientPage } from './pages/ClientPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ClientDashboard } from './pages/ClientDashboard'
import { Dashboard } from './pages/Dashboard'
import { StudioSettings } from './pages/StudioSettings'
import { VendorPortal } from './pages/VendorPortal'
import { EventCapturePage } from './pages/EventCapturePage'
import { QuestionnairePage } from './pages/QuestionnairePage'
import './styles.css'
import { initSentry } from './sentry'

initSentry()

// ── Global ErrorBoundary ─────────────────────────────────────────────────
// Catches uncaught render errors anywhere in the tree (e.g. lazy-chunk fetch
// failures after a deploy, asset hash mismatches, runtime exceptions). Without
// this, those produce a blank page; here we show a Hebrew RTL fallback panel
// styled to match the index.html splash, and report the error to Sentry.
interface ErrorBoundaryState { hasError: boolean }
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Wrap in try/catch so a Sentry SDK failure can't recurse into the boundary.
    try {
      Sentry.captureException(error, { extra: { errorInfo } })
    } catch {
      // Last-resort: log to console; don't rethrow.
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary failed to report to Sentry', error)
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
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
        </div>
      </div>
    )
  }
}

function Router() {
  const path = window.location.pathname

  if (path === '/') return <LandingPageHe />
  if (path === '/demo') return <DemoPage />
  if (path === '/dashboard') return <Dashboard />
  if (path === '/studio-settings') return <StudioSettings />
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
  // Short gallery URL: /<biz>/g/<gallery-slug>
  if (/^\/[^/]+\/g\/[^/]+\/?$/.test(path)) return <App />
  // Clean gallery URL: /{business-slug}/{gallery-slug}
  if (/^\/[^/]+\/[^/]+\/?$/.test(path)) return <App />

  // Fallback: redirect to landing
  window.location.replace('/')
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.StrictMode>
      <Router />
    </React.StrictMode>
  </ErrorBoundary>
)
// deploy
