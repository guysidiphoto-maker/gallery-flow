// Sentry — Electron renderer + Node main process via a single SDK.
// Reads the DSN from the Vite env. If the DSN is empty (e.g. local dev,
// or before we've signed up for Sentry), init is a no-op and the app runs
// exactly like before. This keeps Sentry strictly opt-in per environment.

import * as Sentry from '@sentry/electron/renderer'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = (import.meta.env.MODE ?? 'development') as string
const RELEASE = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'

export function initSentry(): void {
  if (!DSN) {
    // Intentional: silent no-op until we have a DSN to point at.
    return
  }
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    // Capture 100% of errors. Performance traces sampled lightly because we
    // mostly care about correctness, not p99 latency, at this stage.
    tracesSampleRate: 0.1,
    // Don't send PII automatically — selfies / emails / file paths leak
    // in stack traces if we let it.
    sendDefaultPii: false,
  })
}
