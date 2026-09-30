// Browser error/perf reporting for guests and photographers. No-op without
// VITE_SENTRY_DSN. Context helpers (user, breadcrumbs) live in sentryContext.ts.

type SentrySdk = typeof import('./sentrySdk')
let sdk: SentrySdk | null = null
let pending: Promise<SentrySdk | null> | null = null

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = (import.meta.env.MODE ?? 'development') as string

// The SDK (~75KB gzipped, mostly replay) loads beside the first render instead of
// blocking it; errors thrown before it arrives are not reported.
export function initSentry(): void {
  if (!DSN) return
  pending = import('./sentrySdk').then(S => {
    S.start(DSN, ENVIRONMENT)
    sdk = S
    return S
  }).catch(() => null)
}

/** Runs `fn` with the SDK once it has loaded; a no-op without a DSN. */
export function withSentry(fn: (sentry: SentrySdk) => void): void {
  const run = (S: SentrySdk | null) => { if (S) try { fn(S) } catch { /* observability never throws */ } }
  if (sdk) run(sdk)
  else void pending?.then(run)
}

/** The SDK if it has already loaded, for synchronous reads. */
export const loadedSentry = (): SentrySdk | null => sdk
