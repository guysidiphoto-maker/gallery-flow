// gallery-access.ts — service-role endpoint for public gallery access.
// Actions: signed_url, public_gallery_session (guest viewers) and
// verify_code / redeem_token (legacy client-portal PIN login).

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'

export const maxDuration = 60

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

// ── Origin allowlist guard (Phase 1.B) ──────────────────────────────────
// Allow same-origin (no Origin header on server-to-server, browsers send it),
// production deployment, all *.vercel.app preview deployments, and localhost
// dev. Reject everything else with 403.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true // server-to-server / curl with no Origin
  try {
    const u = new URL(origin)
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.vercel.app')) return true
    if (host === 'pixflow.co.il' || host.endsWith('.pixflow.co.il')) return true
    if (host === 'pixflow-ai.com' || host.endsWith('.pixflow-ai.com')) return true
    if (host === 'eclipsemedia.co.il' || host.endsWith('.eclipsemedia.co.il')) return true
    return false
  } catch {
    return false
  }
}

// ── Request bodies ─────────────────────────────────────────────────────

interface VerifyCodeBody {
  action: 'verify_code'
  clientId?: string
  code?: string
}
interface RedeemTokenBody {
  action: 'redeem_token'
  token?: string
}
interface SignedUrlBody {
  action: 'signed_url'
  bucket?: string
  path?: string
  /** P4.5.C: public-viewer token, gallery-scoped. Verified against the
   *  gallery_id extracted from `path`'s second segment. */
  pvt?: string
  /** P2.2: password-gallery unlock token (gallery_unlock_tokens). Required
   *  (when SIGNED_URL_ENFORCE_ORIGINALS=1) before signing an /originals/
   *  path of a password-protected gallery. No-op for non-password galleries. */
  unlockToken?: string
}
interface PublicGallerySessionBody {
  action: 'public_gallery_session'
  galleryId?: string
  turnstileToken?: string
}
type ActionBody =
  | VerifyCodeBody
  | RedeemTokenBody
  | SignedUrlBody
  | PublicGallerySessionBody

// ── Action: verify_code (Phase 3 hashed-PIN login) ──────────────────────

async function handleVerifyCode(
  body: VerifyCodeBody,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const clientId = String(body.clientId ?? '').trim()
  const code = String(body.code ?? '').trim()
  if (!clientId) { res.status(400).json({ ok: false, error: 'clientId_required' }); return }
  if (!code || code.length < 4 || code.length > 32) {
    res.status(400).json({ ok: false, error: 'invalid_code_format' }); return
  }

  // Extract IP. x-forwarded-for may be a comma-separated list — first entry
  // is the original client.
  const xff = req.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : xff
  const xRealIp = req.headers['x-real-ip']
  const xRealIpStr = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp
  const remote = req.socket?.remoteAddress
  const rawIp =
    (xffStr ? xffStr.split(',')[0].trim() : '') ||
    (xRealIpStr ? String(xRealIpStr).trim() : '') ||
    (remote ? String(remote).trim() : '')
  const ip = rawIp || null

  const uaHeader = req.headers['user-agent']
  const userAgent = Array.isArray(uaHeader) ? uaHeader[0] : (uaHeader ?? null)

  const { data, error } = await supabase.rpc('verify_client_code', {
    p_client_id: clientId,
    p_code: code,
    p_ip: ip,
    p_user_agent: userAgent,
  })
  if (error) {
    res.status(500).json({ ok: false, error: 'verify_failed', detail: error.message?.slice(0, 200) }); return
  }

  // RPC returns SETOF or a single composite row. Normalize to one row.
  const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
  const token = row?.token ?? null
  const expiresAt = row?.expires_at ?? null
  const cooldownUntil = row?.cooldown_until ?? null

  if (token) {
    res.status(200).json({ ok: true, token, expires_at: expiresAt }); return
  }
  if (cooldownUntil) {
    res.status(429).json({ ok: false, error: 'cooldown_active', cooldown_until: cooldownUntil }); return
  }

  // All-NULL response can mean either "wrong code" OR "client not migrated
  // (access_code_hash IS NULL)". Distinguish so the caller can fall back to
  // legacy plain-text PIN compare during rollout.
  const { data: cli } = await supabase
    .from('clients')
    .select('access_code_hash')
    .eq('id', clientId)
    .maybeSingle()
  const hash = (cli as { access_code_hash?: string | null } | null)?.access_code_hash ?? null
  if (cli && hash === null) {
    // Fail-closed (Client Portal V2): only offer the legacy plaintext PIN path
    // when a real legacy code is ACTUALLY configured on a live gallery. A client
    // with neither a hashed code nor a non-empty `clientCode` must be denied —
    // never invite a fallback compare against an empty/absent code.
    const { data: coded } = await supabase
      .from('galleries')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'live')
      .not('delivery_settings->>clientCode', 'is', null)
      .neq('delivery_settings->>clientCode', '')
      .limit(1)
    if (coded && coded.length > 0) {
      res.status(200).json({ ok: true, fallback_to_legacy: true }); return
    }
    res.status(401).json({ ok: false, error: 'access_not_configured' }); return
  }

  res.status(401).json({ ok: false, error: 'invalid_code' })
}

// ── Action: redeem_token (Phase 3 session-token verification) ───────────

async function handleRedeemToken(
  body: RedeemTokenBody,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const token = String(body.token ?? '').trim()
  if (!token) { res.status(400).json({ ok: false, error: 'token_required' }); return }

  const { data, error } = await supabase.rpc('verify_client_token', { p_token: token })
  if (error) {
    res.status(500).json({ ok: false, error: 'verify_failed', detail: error.message?.slice(0, 200) }); return
  }

  const clientId = (data as string | null) ?? null
  if (!clientId) { res.status(401).json({ ok: false, error: 'invalid_token' }); return }
  res.status(200).json({ ok: true, client_id: clientId })
}

// ── Action: signed_url (Phase 4 prep) ───────────────────────────────────

const ALLOWED_BUCKETS = new Set(['gallery-images', 'gallery-stories', 'demo-uploads'])

// P2.2: when '1', signing an /originals/ path requires a valid gallery-scoped
// public-viewer token AND (for password galleries) a valid unlock token.
// Default off → legacy advisory behavior, so this is a safe, reversible flip.
const SIGNED_URL_ENFORCE_ORIGINALS = process.env.SIGNED_URL_ENFORCE_ORIGINALS === '1'

async function handleSignedUrl(
  body: SignedUrlBody,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const bucket = String(body.bucket ?? '').trim()
  const path = String(body.path ?? '').trim()
  if (!bucket || !path) { res.status(400).json({ ok: false, error: 'bucket_and_path_required' }); return }
  if (!ALLOWED_BUCKETS.has(bucket)) { res.status(400).json({ ok: false, error: 'bucket_not_allowed' }); return }
  // Path-traversal guard: reject only when '..' appears as a complete path
  // segment. The original `path.includes('..')` was over-aggressive — real
  // production filenames like `b270cdd8_11..jpg` contain consecutive dots
  // inside the filename and aren't traversal attempts.
  if (path.split('/').some(seg => seg === '..')) {
    res.status(400).json({ ok: false, error: 'invalid_path' }); return
  }
  if (path.startsWith('/') || path.includes('//')) {
    res.status(400).json({ ok: false, error: 'invalid_path' }); return
  }

  // Phase 3 token check (advisory): if a token is present, verify and log.
  // For Phase 4.1 we issue signed URLs WITHOUT requiring a token, so the bucket
  // can stay public during prep. When the bucket flips private, token will
  // become required — but that's a later phase's enforcement flag flip.
  const headerToken = String(req.headers['x-client-session'] ?? '').trim()
  let tokenClientId: string | null = null
  if (headerToken) {
    const { data } = await supabase.rpc('verify_client_token', { p_token: headerToken })
    tokenClientId = (data as string | null) ?? null
  }

  // Phase 4.5.C — public-viewer token. Path scheme is
  // `<biz_slug>/<gallery_id>/<thumbs|web|originals>/<file>`. Extract the
  // gallery_id (second segment) and verify the pvt is alive + gallery-scoped.
  // Advisory only for now: log on mismatch but still issue. P4.5.E will flip
  // this to enforcing when the bucket goes private.
  const pvt = String(body.pvt ?? '').trim()
  const segments = path.split('/')
  const galleryIdGuess = segments[1] // <slug>/<gallery_id>/...
  const galleryIdValid =
    !!galleryIdGuess &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(galleryIdGuess)
  let pvtValidated = false
  let pvtMismatch = false
  if (pvt && bucket === 'gallery-images' && galleryIdValid) {
    const { data, error: pvtErr } = await supabase.rpc('verify_public_gallery_session', {
      p_token: pvt,
      p_gallery_id: galleryIdGuess,
    })
    if (!pvtErr) {
      pvtValidated = data === true
      pvtMismatch = !pvtValidated
      if (pvtMismatch) {
        console.warn('[signed_url] pvt provided but failed verification', { galleryIdGuess })
      }
    }
  }

  // ── P2.2: enforce authorization for ORIGINAL downloads ──────────────────
  // Originals live at `<slug>/<gallery_id>/originals/<file>`. Once the bucket
  // flips private (P2.4), the public URL dies and this signed URL becomes the
  // ONLY way to fetch an original — so it must prove the caller is authorized:
  //   1. a live, gallery-scoped public-viewer token (anti-abuse + scope), and
  //   2. for PASSWORD galleries, a valid unlock token (gallery_token_is_valid
  //      returns true unconditionally for non-password galleries, so this is a
  //      no-op there and an enforced gate for password galleries).
  // Flag-gated (SIGNED_URL_ENFORCE_ORIGINALS) so rollout is reversible; when
  // off, behavior is the legacy advisory path (issues without requiring PVT).
  const isOriginalPath = bucket === 'gallery-images' && segments.includes('originals')
  if (SIGNED_URL_ENFORCE_ORIGINALS && isOriginalPath) {
    if (!galleryIdValid) {
      res.status(400).json({ ok: false, error: 'invalid_path' }); return
    }
    if (!pvtValidated) {
      res.status(401).json({ ok: false, error: 'pvt_required' }); return
    }
    const unlockToken = String(body.unlockToken ?? '').trim()
    const { data: authzOk, error: authzErr } = await supabase.rpc('gallery_token_is_valid', {
      p_gallery_id: galleryIdGuess,
      p_token: unlockToken || null,
    })
    if (authzErr || authzOk !== true) {
      res.status(401).json({ ok: false, error: 'unlock_required' }); return
    }
  }

  // Issue a 60-minute signed URL via Supabase storage API.
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) {
    res.status(500).json({ ok: false, error: 'sign_failed', detail: error?.message?.slice(0, 200) })
    return
  }

  res.status(200).json({
    ok: true,
    url: data.signedUrl,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    // Echo whether token was present (helps observability when we flip the
    // bucket and need to know if any clients are still calling without one).
    token_present: tokenClientId !== null,
    pvt_validated: pvtValidated,
  })
}

// ── Phase 4.5.A/B — public_gallery_session ──────────────────────────────
//
// Issues a 60-min opaque token (43-char base64url) scoped to one gallery,
// one IP. Used by the anonymous viewer at /<biz>/<gallery> to call
// signed_url after the bucket flip. NOT to be confused with Phase 3
// `verify_code`/`redeem_token` which authenticate PIN-protected client
// dashboards.
//
// Anti-abuse:
//   - 30 sessions/IP/hour soft (P4.5.B requires a valid Cloudflare
//     Turnstile token past this point)
//   - 100 sessions/IP/hour hard ceiling
//   - Origin allowlist (existing guard)
//
// Idempotent on (ip, galleryId): a same-IP request that lands within 5 min
// of an existing un-expired token reuses it (issue_public_gallery_session
// RPC handles this).
//
// Env (P4.5.B):
//   CF_TURNSTILE_SECRET — Cloudflare Turnstile secret key (server-side)
//   VITE_CF_TURNSTILE_SITE_KEY — public site key (read here for the 429
//     response; the frontend reads it from import.meta.env at build time)
// If the secret is unset we fail-open: soft limit logs a warning but
// allows the request through. Once the env is configured the soft limit
// becomes enforcing.

const SOFT_LIMIT_PER_HOUR = 30
const HARD_LIMIT_PER_HOUR = 100

const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_TURNSTILE_SITE_KEY = process.env.VITE_CF_TURNSTILE_SITE_KEY ?? ''
const CF_TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Verify a Cloudflare Turnstile token via siteverify. Returns true iff
// Cloudflare confirms it. Fails closed on network errors so a flaky
// Cloudflare doesn't open the soft limit.
async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  if (!CF_TURNSTILE_SECRET) return false
  if (!token) return false
  try {
    const form = new URLSearchParams()
    form.set('secret', CF_TURNSTILE_SECRET)
    form.set('response', token)
    if (ip && ip !== '0.0.0.0') form.set('remoteip', ip)
    const r = await fetch(CF_TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      // Cloudflare expects application/x-www-form-urlencoded
    })
    if (!r.ok) return false
    const j = await r.json() as { success?: boolean; 'error-codes'?: string[] }
    if (!j.success) {
      console.warn('[turnstile] siteverify rejected', { 'error-codes': j['error-codes'] ?? [] })
      return false
    }
    return true
  } catch (err) {
    console.warn('[turnstile] siteverify error', err)
    return false
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getClientIp(req: VercelRequest): string {
  // Vercel forwards x-forwarded-for. First entry is the real client.
  const xff = req.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : xff
  if (xffStr) return xffStr.split(',')[0].trim()
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string') return cf
  const real = req.headers['x-real-ip']
  if (typeof real === 'string') return real
  return '0.0.0.0'
}

async function handlePublicGallerySession(
  body: PublicGallerySessionBody,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!supabase) { res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return }

  const galleryId = String(body.galleryId ?? '').trim()
  if (!galleryId || !UUID_RE.test(galleryId)) {
    res.status(400).json({ ok: false, error: 'invalid_payload' }); return
  }

  const ip = getClientIp(req)
  const userAgent = (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ?? null
  const turnstileToken = String(body.turnstileToken ?? '').trim()

  // Per-IP rate limit: count rows in the last hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countErr } = await supabase
    .from('public_gallery_sessions')
    .select('token', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('issued_at', oneHourAgo)
  if (countErr) {
    console.error('[public_gallery_session] rate_check_failed', { galleryId, ip, message: countErr.message })
    res.status(500).json({ ok: false, error: 'rate_check_failed', detail: countErr.message.slice(0, 200) }); return
  }
  const recentCount = count ?? 0

  if (recentCount >= HARD_LIMIT_PER_HOUR) {
    res.status(429).json({ ok: false, error: 'hard_limit_exceeded', retry_after_seconds: 3600 }); return
  }

  // Phase 4.5.B — Turnstile enforcement past the soft limit.
  // 1. If a token was sent, verify it via Cloudflare siteverify regardless of
  //    rate. A valid token boosts trust on the row (turnstile_validated=true).
  // 2. If recent >= soft limit AND no valid token AND the secret is
  //    configured → reject with 429 turnstile_required + the public site key
  //    so the frontend can render the widget and retry.
  // 3. If the secret is NOT configured (e.g., dev or pre-rollout), fail-open:
  //    log a warning and proceed. This keeps the endpoint useful before
  //    Cloudflare is wired up.
  let turnstileValidated = false
  if (turnstileToken && CF_TURNSTILE_SECRET) {
    turnstileValidated = await verifyTurnstileToken(turnstileToken, ip)
  }

  if (recentCount >= SOFT_LIMIT_PER_HOUR && !turnstileValidated) {
    if (CF_TURNSTILE_SECRET) {
      res.status(429).json({
        ok: false,
        error: 'turnstile_required',
        retry_after_seconds: 60,
        turnstile_site_key: CF_TURNSTILE_SITE_KEY || null,
      })
      return
    }
    console.warn('[public_gallery_session] soft limit hit but CF_TURNSTILE_SECRET unset; failing open', { ip, recentCount, galleryId })
  }

  // Mint or reuse session via RPC.
  const { data, error: rpcErr } = await supabase.rpc('issue_public_gallery_session', {
    p_gallery_id: galleryId,
    p_ip: ip,
    p_user_agent: userAgent,
    p_turnstile_validated: turnstileValidated,
  })
  if (rpcErr) {
    if (rpcErr.message?.includes('gallery_not_live')) {
      res.status(404).json({ ok: false, error: 'gallery_not_live' }); return
    }
    console.error('[public_gallery_session] issue_failed', { galleryId, ip, message: rpcErr.message, code: rpcErr.code, hint: rpcErr.hint })
    res.status(500).json({ ok: false, error: 'issue_failed', detail: rpcErr.message?.slice(0, 200) }); return
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.token || !row?.expires_at) {
    console.error('[public_gallery_session] rpc_returned_empty', { galleryId, ip, dataShape: typeof data, isArray: Array.isArray(data) })
    res.status(500).json({ ok: false, error: 'issue_failed', detail: 'rpc_returned_empty' }); return
  }

  res.status(200).json({
    ok: true,
    token: row.token,
    expires_at: row.expires_at,
  })
}

// ── Dispatcher ──────────────────────────────────────────────────────────

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
  }
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  const body = (req.body || {}) as ActionBody
  const action = (body as { action?: string }).action
  switch (action) {
    case 'verify_code': return handleVerifyCode(body as VerifyCodeBody, req, res)
    case 'redeem_token': return handleRedeemToken(body as RedeemTokenBody, res)
    case 'signed_url': return handleSignedUrl(body as SignedUrlBody, req, res)
    case 'public_gallery_session': return handlePublicGallerySession(body as PublicGallerySessionBody, req, res)
    default: return res.status(400).json({ ok: false, error: 'unknown_action', detail: String(action) })
  }
}

export default withSentry('gallery-access', handler)
