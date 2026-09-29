// gallery-access.ts — service-role endpoint for public gallery access.
// Actions: signed_url, public_gallery_session (guest viewers) and
// verify_code / redeem_token (legacy client-portal PIN login).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { serviceClient } from '../server/supabase.js'
import { isAllowedOrigin } from '../server/origin.js'

export const maxDuration = 60

const supabase = serviceClient()


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
  /** Public-viewer token, verified against the gallery id in `path`'s second segment. */
  pvt?: string
  /** Password-gallery unlock token; required for /originals/ paths when
   *  SIGNED_URL_ENFORCE_ORIGINALS=1. */
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

// ── Action: verify_code (hashed-PIN login) ──────────────────────────────

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

  // The first x-forwarded-for entry is the original client.
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

  // An empty result is either a wrong code or a client with no hashed code yet;
  // the latter may fall back to the legacy plaintext PIN.
  const { data: cli } = await supabase
    .from('clients')
    .select('access_code_hash')
    .eq('id', clientId)
    .maybeSingle()
  const hash = (cli as { access_code_hash?: string | null } | null)?.access_code_hash ?? null
  if (cli && hash === null) {
    // Fail closed: only offer the legacy fallback when a live gallery actually
    // has a non-empty clientCode — never compare against an absent code.
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

// ── Action: redeem_token (session-token verification) ───────────────────

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

// ── Action: signed_url ──────────────────────────────────────────────────

const ALLOWED_BUCKETS = new Set(['gallery-images', 'gallery-stories', 'demo-uploads'])

// When '1', signing an /originals/ path requires a public-viewer token and, for
// password galleries, an unlock token. Off = legacy advisory behavior.
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
  // Only a whole '..' segment is traversal; real filenames like `x_11..jpg` exist.
  if (path.split('/').some(seg => seg === '..')) {
    res.status(400).json({ ok: false, error: 'invalid_path' }); return
  }
  if (path.startsWith('/') || path.includes('//')) {
    res.status(400).json({ ok: false, error: 'invalid_path' }); return
  }

  // Advisory only: a client session token is verified when present but not required.
  const headerToken = String(req.headers['x-client-session'] ?? '').trim()
  let tokenClientId: string | null = null
  if (headerToken) {
    const { data } = await supabase.rpc('verify_client_token', { p_token: headerToken })
    tokenClientId = (data as string | null) ?? null
  }

  // Paths are `<biz_slug>/<gallery_id>/<thumbs|web|originals>/<file>`. Outside
  // the originals gate below, a pvt mismatch is only logged.
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

  // With a private bucket this signed URL is the only way to an original, so it
  // needs a pvt plus, for password galleries, an unlock token
  // (gallery_token_is_valid is always true for non-password galleries).
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

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) {
    res.status(500).json({ ok: false, error: 'sign_failed', detail: error?.message?.slice(0, 200) })
    return
  }

  res.status(200).json({
    ok: true,
    url: data.signedUrl,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    // Observability: shows whether clients still call without a token.
    token_present: tokenClientId !== null,
    pvt_validated: pvtValidated,
  })
}

// ── Action: public_gallery_session ──────────────────────────────────────
// 60-min token scoped to one gallery + IP for the anonymous viewer. Past the soft
// limit a Turnstile token is required (fail-open when the secret is unset).

const SOFT_LIMIT_PER_HOUR = 30
const HARD_LIMIT_PER_HOUR = 100

const CF_TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET ?? ''
const CF_TURNSTILE_SITE_KEY = process.env.VITE_CF_TURNSTILE_SITE_KEY ?? ''
const CF_TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Fails closed on network errors so a flaky Cloudflare doesn't open the soft limit.
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

  // A sent token is always verified (recorded as turnstile_validated). Past the
  // soft limit without one → 429 with the site key so the viewer can show the widget.
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
