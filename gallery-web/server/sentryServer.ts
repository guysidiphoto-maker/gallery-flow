// Dependency-free Sentry reporting for api/ functions: POSTs events to the store
// endpoint parsed from the (public) DSN, avoiding @sentry/node's cold-start cost.
// No DSN → console.error only.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const DSN = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || ''
const ENVIRONMENT = process.env.VERCEL_ENV || process.env.NODE_ENV || 'production'
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA || undefined

// Parse the DSN once. Format: https://<publicKey>@<host>/<projectId>
const parsed = (() => {
  if (!DSN) return null
  try {
    const u = new URL(DSN)
    const projectId = u.pathname.replace(/^\/+/, '')
    if (!u.username || !projectId) return null
    return {
      storeUrl: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      publicKey: u.username,
    }
  } catch {
    return null
  }
})()

// Belt-and-braces over curated context: redact sensitive-looking keys and mask
// emails inside strings (mirrors the frontend beforeSend).
const SENSITIVE_KEY = /phone|email|mail|token|authorization|secret|password|signature|signed|service_?role|api_?key|cookie|dsn/i
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value == null) return value
  if (typeof value === 'string') {
    const masked = value.replace(EMAIL_RE, '[email]')
    return masked.length > 500 ? masked.slice(0, 500) + '…' : masked
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 20).map(v => scrub(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : scrub(v, depth + 1)
    }
    return out
  }
  return String(value)
}

export interface ApiErrorContext {
  /** Endpoint name, e.g. 'gallery-zip'. Required. */
  endpoint: string
  method?: string
  /** Sub-action within a multi-action endpoint (e.g. 'signed_url'). */
  action?: string
  status?: number
  businessId?: string
  galleryId?: string
  clientId?: string
  eventId?: string
  questionnaireId?: string
  imageId?: string
  /** Short reason label, e.g. 'twilio_failed'. */
  reason?: string
  [key: string]: unknown
}

/** Report an unexpected server error to Sentry (and always to console). Never
 *  throws, never blocks the response with more than a short timeout. Awaited by
 *  callers so the event is delivered before the serverless instance freezes. */
export async function captureApiError(error: unknown, context: ApiErrorContext): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error(`[api-error] endpoint=${context.endpoint} status=${context.status ?? ''} reason=${context.reason ?? ''}: ${err.message}`)

  if (!parsed) return

  const eventId = (globalThis.crypto?.randomUUID?.() ?? '').replace(/-/g, '') || fallbackId()
  const tags: Record<string, string> = { endpoint: context.endpoint }
  if (context.method) tags.method = context.method
  if (context.action) tags.action = context.action
  if (context.status != null) tags.status = String(context.status)
  if (context.reason) tags.reason = context.reason

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    logger: 'api',
    environment: ENVIRONMENT,
    release: RELEASE,
    transaction: context.endpoint,
    tags,
    extra: scrub(context),
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: (err.message || 'Unknown error').slice(0, 500),
          // Raw stack string (file paths only — no PII) for debugging.
          extra_stack: (err.stack || '').slice(0, 4000),
        },
      ],
    },
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    await fetch(parsed.storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=pixflow-server/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch (postErr) {
    // Reporting must never break the request path.
    console.error('[sentryServer] send failed:', postErr instanceof Error ? postErr.message : postErr)
  }
}

function fallbackId(): string {
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>

/** Report any unhandled throw to Sentry and answer a clean 500 (no leaked stack).
 *  Responses the handler sends itself are untouched. */
export function withSentry(endpoint: string, handler: Handler): Handler {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      return await handler(req, res)
    } catch (err) {
      await captureApiError(err, { endpoint, method: req.method, status: 500, reason: 'unhandled' })
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error' })
      }
    }
  }
}
