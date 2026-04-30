// Sentry — Electron main process side. Captures crashes that happen in
// the Node-side of the app (file IO, IPC handlers, native errors).
// Reads DSN from process.env; no-op if absent.

import * as Sentry from '@sentry/electron/main'

const DSN = process.env.VITE_SENTRY_DSN ?? process.env.SENTRY_DSN ?? ''
const ENVIRONMENT = process.env.NODE_ENV ?? 'development'

export function initSentryMain(): void {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
