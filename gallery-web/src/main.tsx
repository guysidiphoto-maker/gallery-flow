import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { LandingPage } from './pages/LandingPage'
import { DemoPage } from './pages/DemoPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ClientPage } from './pages/ClientPage'
import './styles.css'

function Router() {
  const path = window.location.pathname

  if (path === '/') return <LandingPage />
  if (path === '/demo') return <DemoPage />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
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
