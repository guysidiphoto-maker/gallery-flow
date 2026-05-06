import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { LandingPageHe } from './pages/LandingPageHe'
import { DemoPage } from './pages/DemoPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ClientPage } from './pages/ClientPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { ClientDashboard } from './pages/ClientDashboard'
import { Dashboard } from './pages/Dashboard'
import { VendorPortal } from './pages/VendorPortal'
import { EventCapturePage } from './pages/EventCapturePage'
import { QuestionnairePage } from './pages/QuestionnairePage'
import './styles.css'
import { initSentry } from './sentry'

initSentry()

// A request that arrived via a photographer's custom domain
// (e.g. photos.studio-alma.co.il) skips the businessSlug segment in URLs —
// the hostname IS the business. So `/wedding-cohen` on that host means the
// gallery `wedding-cohen` of that one studio, not a 1-segment fallback.
function isCustomDomainHost(host: string): boolean {
  if (!host) return false
  if (host === 'pixflow-ai.com' || host === 'www.pixflow-ai.com') return false
  if (host.endsWith('.vercel.app')) return false
  if (host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1') return false
  return true
}

function Router() {
  const path = window.location.pathname
  const onCustomDomain = isCustomDomainHost(window.location.hostname)

  // App-shell routes that behave the same regardless of hostname —
  // dashboard, demo, legal, edge feature pages.
  if (path === '/dashboard') return <Dashboard />
  if (path === '/demo') return <DemoPage />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
  if (path.startsWith('/q/')) return <QuestionnairePage />
  if (path.startsWith('/event/')) return <EventCapturePage />
  if (path.startsWith('/vendor/') || /^\/[^/]+\/vendor\//.test(path)) return <VendorPortal />
  if (/\/client\/[^/]+\/dashboard/.test(path)) return <ClientDashboard />
  if (path.startsWith('/client/') || /^\/[^/]+\/client\//.test(path)) return <PortfolioPage />
  if (path.startsWith('/gallery') || /^\/[^/]+\/gallery\//.test(path)) return <App />

  if (onCustomDomain) {
    // On a custom domain the root maps to the photographer's portfolio,
    // and a single-segment path is a gallery slug under this studio.
    // App.tsx and PortfolioPage read window.location.hostname themselves
    // to resolve which business to show.
    if (path === '/' || path === '') return <PortfolioPage />
    if (/^\/[^/]+\/?$/.test(path)) return <App />
  } else {
    // Default host → marketing landing on root, two-segment path = gallery.
    if (path === '/') return <LandingPageHe />
    if (/^\/[^/]+\/[^/]+\/?$/.test(path)) return <App />
  }

  // Fallback: redirect to landing
  window.location.replace('/')
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
)
// deploy
