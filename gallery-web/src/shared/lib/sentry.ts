// Sentry — gallery viewer + photographer dashboard (Vite SPA).
//
// Captures errors that happen in the browser for both guests (gallery viewer,
// face search, downloads) and photographers (dashboard CRUD, publish flow,
// uploads). Adds performance traces, session replay on every captured error,
// and a PII-stripping `beforeSend` so emails / tokens never leave the device.
//
// ── Required env (production) ─────────────────────────────────────────────
//   VITE_SENTRY_DSN — Sentry project DSN. If unset, this module is a no-op.
//                     MUST be set in Vercel for prod + preview environments
//                     so we can diagnose user-reported crashes.
//
// User / gallery context + action breadcrumbs are wired through
// `src/lib/sentryContext.ts` — call the helpers in there from feature code
// so every captured exception has a useful trail of what the user did.

import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = (import.meta.env.MODE ?? 'development') as string

// Matches obvious email addresses anywhere in a string. Intentionally narrow:
// we only need to redact the values guests / photographers type into forms
// (share email, login, support replies). Catastrophic-backtrack-safe.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

/** Walk an arbitrary JSON-like value and replace any email substrings with
 *  the literal `[redacted]`. Cycles are not possible here because we only
 *  pass JSON-compatible payloads (request.data / event.extra), so a depth
 *  guard plus a primitive base case is sufficient. */
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
    // 10% performance sampling — enough signal to spot regressions on the
    // hot paths (gallery first-paint, dashboard publish) without blowing
    // through the Sentry transaction quota.
    tracesSampleRate: 0.1,
    // Session Replay: cheap baseline rate for ambient sessions, full capture
    // for any session that produced a handled or unhandled exception. The
    // replay-on-error path is ~10× more diagnostic than a bare stack trace —
    // we see the click that triggered the bug, not just the stack.
    replaysSessionSampleRate: 0.02,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text + media by default so replays never leak photo
        // contents or photographer / guest names. We only need the
        // structure (which buttons were clicked, what re-rendered).
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // The viewer is anonymous — never attach IP / email / etc by default.
    // setSentryUser() explicitly opts photographers in on the dashboard.
    sendDefaultPii: false,
    // Final PII sweep: strip emails from form payloads + extra context
    // before the event leaves the browser. Defense-in-depth on top of
    // sendDefaultPii: false.
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
        // Never let a redaction failure swallow the event — surface the
        // original payload instead of dropping the report.
      }
      return event
    },
  })
}
