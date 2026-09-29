import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { isMarketingRoute, resolveRoute } from './app/routes'
import { initSentry } from './shared/lib/sentry'
import { initAnalytics } from './shared/lib/analytics'
import { initMetaPixel } from './shared/lib/metaPixel'

initSentry()
initAnalytics() // no-op unless VITE_GA4_MEASUREMENT_ID is set
// Ad pixel only on marketing pages — never on galleries, dashboard or forms.
if (isMarketingRoute(resolveRoute(window.location.pathname))) initMetaPixel()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </ErrorBoundary>,
)
