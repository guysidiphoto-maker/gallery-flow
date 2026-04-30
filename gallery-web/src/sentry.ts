// Sentry — gallery viewer (Vite SPA). Captures errors that happen in the
// browser when a guest is using the gallery (face search, downloads, etc).
// Reads DSN from Vite env; no-op if absent.

import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = (import.meta.env.MODE ?? 'development') as string

export function initSentry(): void {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: 0.1,
    // The viewer is anonymous — never attach IP/email/etc by default.
    sendDefaultPii: false,
  })
}
