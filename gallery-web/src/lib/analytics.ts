// Analytics foundation — Google Analytics 4 (GA4), env-gated.
//
// SAFE BY DEFAULT: nothing loads and nothing is sent unless
// `VITE_GA4_MEASUREMENT_ID` is set at build time (a Vercel env var). With no
// ID, every function here is a no-op — zero network, zero behavior change. This
// lets the code ship safely now; you flip it on by adding the env var later.
//
// What you get once the ID is set:
//   • GA4 "enhanced measurement" auto-tracks page_view on every route
//     (galleries, dashboard, landing pages, blog, language routes) with no
//     per-component code — covers most of the page-level KPIs by itself.
//   • track(event, params) for explicit conversion/CTA events.
//
// No private IDs are hardcoded. The ID comes only from the environment.

import { trackMetaStandard, trackMetaCustom, metaPixelEnabled } from './metaPixel'

const GA_ID: string | undefined = import.meta.env.VITE_GA4_MEASUREMENT_ID

// Canonical event taxonomy. Page-level views are captured automatically by GA4
// enhanced measurement; the events below are the explicit ones worth firing.
export const AnalyticsEvent = {
  DEMO_CLICK: 'demo_click',
  PRICING_CLICK: 'pricing_click',
  LEAD_CLICK: 'lead_click',
  CTA_CLICK: 'cta_click',
  SEO_LANDING_VIEW: 'seo_landing_view',
  BLOG_VIEW: 'blog_view',
  LANGUAGE_ROUTE: 'language_route',
  CONVERSION: 'conversion',
} as const

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

// Map our event taxonomy → Meta events. Standard events are the ones Meta's
// optimizer understands; everything else is a Custom event so the real Standard
// conversions (Lead/CompleteRegistration) stay clean. Per docs/PIXFLOW_TRACKING_PLAN.
const META_STANDARD: Partial<Record<AnalyticsEventName, string>> = {
  [AnalyticsEvent.CONVERSION]: 'CompleteRegistration',
  [AnalyticsEvent.LEAD_CLICK]: 'Lead',
}
const META_CUSTOM: Partial<Record<AnalyticsEventName, string>> = {
  [AnalyticsEvent.CTA_CLICK]: 'ClickStart',
  [AnalyticsEvent.DEMO_CLICK]: 'DemoClick',
  [AnalyticsEvent.PRICING_CLICK]: 'PricingClick',
  [AnalyticsEvent.SEO_LANDING_VIEW]: 'SeoLandingView',
  [AnalyticsEvent.BLOG_VIEW]: 'BlogView',
  [AnalyticsEvent.LANGUAGE_ROUTE]: 'LanguageRoute',
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let initialized = false

/** Inject GA4 (gtag.js) once, only if an ID is configured. No-op otherwise. */
export function initAnalytics(): void {
  if (initialized || !GA_ID || typeof window === 'undefined') return
  initialized = true
  try {
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
    document.head.appendChild(s)

    window.dataLayer = window.dataLayer || []
    // gtag must push `arguments` verbatim (not an array) — GA4 requirement.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
    window.gtag('js', new Date())
    // anonymize_ip + standard config; enhanced measurement is enabled in the
    // GA4 property UI and needs no code here.
    window.gtag('config', GA_ID, { anonymize_ip: true })
  } catch {
    // Never let analytics break the app.
    initialized = false
  }
}

/**
 * Fire a conversion/CTA event to every configured destination (GA4 + Meta
 * Pixel). Each destination is independently gated by its own env var, so this
 * is a no-op for whichever one isn't configured.
 */
export function track(
  event: AnalyticsEventName,
  params?: Record<string, unknown>,
): void {
  // GA4
  try {
    if (GA_ID && typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', event, params || {})
    }
  } catch {
    /* swallow — analytics must never throw into the app */
  }
  // Meta Pixel (no-op unless VITE_META_PIXEL_ID is set)
  const std = META_STANDARD[event]
  if (std) trackMetaStandard(std, params)
  const custom = META_CUSTOM[event]
  if (custom) trackMetaCustom(custom, params)
}

/** True when any analytics destination is active (GA4 or Meta Pixel). */
export function analyticsEnabled(): boolean {
  return Boolean(GA_ID) || metaPixelEnabled()
}
