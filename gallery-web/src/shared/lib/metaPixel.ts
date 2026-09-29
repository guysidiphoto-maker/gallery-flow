// Meta Pixel, env-gated: with no VITE_META_PIXEL_ID every function here is a
// no-op (no network, no cookies). Mirrors analytics.ts (GA4).

const PIXEL_ID: string | undefined = import.meta.env.VITE_META_PIXEL_ID

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

let initialized = false

/** Inject the Meta Pixel base code once, only if an ID is configured. No-op otherwise. */
export function initMetaPixel(): void {
  if (initialized || !PIXEL_ID || typeof window === 'undefined') return
  initialized = true
  try {
    // Standard Meta Pixel base snippet (typed/guarded). Queues calls until
    // fbevents.js loads, then flushes them.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return
      const n: any = (f.fbq = function () {
        n.callMethod
          ? // eslint-disable-next-line prefer-spread, prefer-rest-params
            n.callMethod.apply(n, arguments)
          : // eslint-disable-next-line prefer-rest-params
            n.queue.push(arguments)
      })
      if (!f._fbq) f._fbq = n
      n.push = n
      n.loaded = true
      n.version = '2.0'
      n.queue = []
      const t = b.createElement(e) as HTMLScriptElement
      t.async = true
      t.src = v
      const s = b.getElementsByTagName(e)[0]
      s.parentNode!.insertBefore(t, s)
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    /* eslint-enable @typescript-eslint/no-explicit-any */

    window.fbq!('init', PIXEL_ID)
    window.fbq!('track', 'PageView')
  } catch {
    // Never let the pixel break the app.
    initialized = false
  }
}

/** Fire a Meta *Standard* event (PageView, Lead, CompleteRegistration, …). No-op if disabled. */
export function trackMetaStandard(event: string, params?: Record<string, unknown>): void {
  try {
    if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return
    window.fbq('track', event, params || {})
  } catch {
    /* swallow — the pixel must never throw into the app */
  }
}

/** Fire a Meta *Custom* event (ClickStart, CreateGallery, …). No-op if disabled. */
export function trackMetaCustom(event: string, params?: Record<string, unknown>): void {
  try {
    if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return
    window.fbq('trackCustom', event, params || {})
  } catch {
    /* swallow */
  }
}
