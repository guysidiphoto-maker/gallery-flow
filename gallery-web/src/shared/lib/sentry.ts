// Browser error/perf reporting for guests and photographers. No-op without
// VITE_SENTRY_DSN. Context helpers (user, breadcrumbs) live in sentryContext.ts.

import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = (import.meta.env.MODE ?? 'development') as string

// Narrow, backtrack-safe email matcher for redacting form payloads.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

// Payloads are JSON-compatible (no cycles), so a depth guard is enough.
function redactEmails(value: unknown, depth = 0): unknown {
  if (depth > 6) return value
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[redacted]')
  if (Array.isArray(value)) return value.map(v => redactEmails(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactEmails(v, depth + 1)
    }
    return out
  }
  return value
}

export function initSentry(): void {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    // Enough signal to spot regressions without exhausting the transaction quota.
    tracesSampleRate: 0.1,
    // Cheap ambient replay rate, full capture for any session with an error.
    replaysSessionSampleRate: 0.02,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Replays must never leak photos or names; structure is all we need.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // Viewers are anonymous; setSentryUser() opts photographers in explicitly.
    sendDefaultPii: false,
    // Defense-in-depth: strip emails before the event leaves the browser.
    beforeSend(event) {
      try {
        const req = event.request
        if (req && req.data !== undefined) {
          req.data = redactEmails(req.data) as typeof req.data
        }
        if (event.extra) {
          event.extra = redactEmails(event.extra) as typeof event.extra
        }
        if (event.contexts) {
          event.contexts = redactEmails(event.contexts) as typeof event.contexts
        }
      } catch {
        // A redaction failure must not drop the report.
      }
      return event
    },
  })
}
