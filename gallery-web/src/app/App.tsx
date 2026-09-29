import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { resolveRoute, type RouteId } from './routes'
import { GalleryViewerPage } from '@/features/viewer/GalleryViewerPage'

// Lazy-load a named export so each page is its own chunk.
function page<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then(m => ({ default: m[name] as ComponentType })))
}

// The gallery viewer is the LCP-critical page, so it ships in the main chunk.
const PAGES: Record<RouteId, ComponentType | LazyExoticComponent<ComponentType>> = {
  gallery: GalleryViewerPage,
  home: page(() => import('@/features/marketing/home3d/Homepage3D'), 'Homepage3D'),
  'home-legacy': page(() => import('@/features/marketing/pages/LandingPageHe'), 'LandingPageHe'),
  photographers: page(() => import('@/features/marketing/pages/PhotographersLanding'), 'PhotographersLanding'),
  'landing-en': page(() => import('@/features/marketing/pages/LandingPage'), 'LandingPage'),
  'seo-landing': page(() => import('@/features/marketing/pages/SeoLanding'), 'SeoLanding'),
  'blog-index': page(() => import('@/features/marketing/pages/BlogIndex'), 'BlogIndex'),
  'blog-post': page(() => import('@/features/marketing/pages/BlogPost'), 'BlogPost'),
  demo: page(() => import('@/features/marketing/pages/DemoPage'), 'DemoPage'),
  pricing: page(() => import('@/features/marketing/pages/PricingPage'), 'default'),
  terms: page(() => import('@/features/marketing/pages/TermsPage'), 'TermsPage'),
  privacy: page(() => import('@/features/marketing/pages/PrivacyPage'), 'PrivacyPage'),
  dashboard: page(() => import('@/features/dashboard/DashboardPage'), 'Dashboard'),
  'studio-settings': page(() => import('@/features/studio-settings/StudioSettingsPage'), 'StudioSettings'),
  'brand-kit': page(() => import('@/features/brand-kit/BrandKitPage'), 'BrandKit'),
  admin: page(() => import('@/features/admin/AdminPage'), 'AdminPage'),
  'client-invite-accept': page(() => import('@/features/client-portal/InviteAcceptPage'), 'ClientInviteAccept'),
  'client-login': page(() => import('@/features/client-portal/ClientLoginPage'), 'ClientLogin'),
  'client-portal': page(() => import('@/features/client-portal/ClientPortalPage'), 'ClientDashboard'),
  portfolio: page(() => import('@/features/portfolio/PortfolioPage'), 'PortfolioPage'),
  questionnaire: page(() => import('@/features/questionnaire/QuestionnairePage'), 'QuestionnairePage'),
  'event-capture': page(() => import('@/features/event-capture/EventCapturePage'), 'EventCapturePage'),
  vendor: page(() => import('@/features/vendor/VendorPortalPage'), 'VendorPortal'),
}

export function App() {
  const route = resolveRoute(window.location.pathname)
  if (!route) {
    window.location.replace('/')
    return null
  }
  const Page = PAGES[route]
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
}
