import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { LandingPage } from './pages/LandingPage'
import { DemoPage } from './pages/DemoPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ClientPage } from './pages/ClientPage'
import { ClientDashboard } from './pages/ClientDashboard'
import { VendorPortal } from './pages/VendorPortal'
import './styles.css'

function Router() {
  const path = window.location.pathname

  if (path === '/') return <LandingPage />
  if (path === '/demo') return <DemoPage />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
  // Vendor portal
  if (path.startsWith('/vendor/') || /^\/[^/]+\/vendor\//.test(path)) return <VendorPortal />
  // Client dashboard (authenticated)
  if (/\/client\/[^/]+\/dashboard/.test(path)) return <ClientDashboard />
  // Client public page
  if (path.startsWith('/client/') || /^\/[^/]+\/client\//.test(path)) return <ClientPage />
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
