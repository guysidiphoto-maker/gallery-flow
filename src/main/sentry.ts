// Sentry — Electron main process side. Captures crashes that happen in
// the Node-side of the app (file IO, IPC handlers, native errors), AND
// registers the `sentry-ipc://` privileged URL scheme that the renderer
// SDK needs to forward its own events through.
//
// The DSN is intentionally a hard-coded constant. Sentry DSNs are
// designed to be public — they identify a project, not authenticate to
// it — and committing it here is the same trust model Sentry assumes
// for any web client. This also avoids the env-var headache: the
// renderer reads VITE_* via Vite's import.meta.env, but the main
// process can't read those without a build-time substitution that
// electron-vite doesn't do for us by default. The renderer also
// hard-codes the same DSN via Vite's define plugin or the env var.

import * as Sentry from '@sentry/electron/main'

const DEFAULT_DSN = 'https://621766b6dd9c3991b9f5f8c4c419c3cb@o4511299976560640.ingest.us.sentry.io/4511299979051008'
const DSN = process.env.VITE_SENTRY_DSN || process.env.SENTRY_DSN || DEFAULT_DSN
const ENVIRONMENT = process.env.NODE_ENV ?? 'development'

export function initSentryMain(): void {
  // Always init — even if DSN is somehow empty — so the privileged URL
  // scheme registration runs. With an empty DSN, init() is a no-op for
  // event capture but still wires up the scheme.
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
