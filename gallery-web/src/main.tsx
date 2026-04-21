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
import { VendorPortal } from './pages/VendorPortal'
import { EventCapturePage } from './pages/EventCapturePage'
import { QuestionnairePage } from './pages/QuestionnairePage'
import './styles.css'

function Router() {
  const path = window.location.pathname

  if (path === '/') return <LandingPageHe />
  if (path === '/demo') return <DemoPage />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
  // Questionnaire
  if (path.startsWith('/q/')) return <QuestionnairePage />
  // Event lead capture (QR landing)
  if (path.startsWith('/event/')) return <EventCapturePage />
  // Vendor portal
  if (path.startsWith('/vendor/') || /^\/[^/]+\/vendor\//.test(path)) return <VendorPortal />
  // Client dashboard (authenticated)
  if (/\/client\/[^/]+\/dashboard/.test(path)) return <ClientDashboard />
  // Client public page → Portfolio (auto-generated website)
  if (path.startsWith('/client/') || /^\/[^/]+\/client\//.test(path)) return <PortfolioPage />
  if (path.startsWith('/gallery') || /^\/[^/]+\/gallery\//.test(path)) return <App />

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
