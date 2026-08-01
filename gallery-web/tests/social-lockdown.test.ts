// social-lockdown.test.ts — deterministic offline proof of the Social studio
// feature-availability kill-switch (overnight contract C1). Run:
//   npx tsx tests/social-lockdown.test.ts
//
// Proves, WITHOUT network:
//   • FEATURE_SOCIAL_STUDIO unset/off → EVERY Social API handler returns
//     403 { ok:false, error:'feature_disabled' }, even for a fully
//     entitled-looking request (POST + allowed origin + Bearer token + ids),
//     and BEFORE origin/method/config/auth/entitlement checks.
//   • Only the exact string 'true' enables the flag ('1'/'TRUE'/'yes' stay off).
//   • Flag on → each handler passes THROUGH the flag gate to its next gate
//     (400 missing params / 401 auth_required), never feature_disabled.
//   • generate-captions now REQUIRES a clientId and runs the
//     requireProductionOwnerOfClient chain (entitlement gate) — previously it
//     only required any authed session.
//   • requireProductionOwnerOfClient itself denies a valid owner WITHOUT the
//     production_suite entitlement (mock-level, mirrors cpv2-entitlements).
//   • append-event-posts: the four Social actions are gated; the non-Social
//     actions (verify_code / signed_url / public_gallery_session / redeem_token
//     path) are NOT feature-gated, so core gallery viewing keeps working.

// Env MUST be set before the api modules load (they build module-level
// clients from it). No request in this file ever reaches the network: every
// asserted response happens before the first supabase/Anthropic call.
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
delete process.env.FEATURE_SOCIAL_STUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

function makeReq(opts: {
  method?: string
  origin?: string
  token?: string
  body?: Record<string, unknown>
} = {}): VercelRequest {
  const headers: Record<string, string> = {}
  if (opts.origin) headers.origin = opts.origin
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  return {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body ?? {},
    socket: {},
  } as unknown as VercelRequest
}

function makeRes(): { res: VercelResponse; out: { status?: number; body?: unknown } } {
  const out: { status?: number; body?: unknown } = {}
  const res = {
    status(c: number) { out.status = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader() { return res },
    end() { return res },
  } as unknown as VercelResponse
  return { res, out }
}

function isFeatureDisabled(out: { status?: number; body?: unknown }): boolean {
  const b = out.body as { ok?: boolean; error?: string } | undefined
  return out.status === 403 && b?.ok === false && b?.error === 'feature_disabled'
}
function errOf(out: { status?: number; body?: unknown }): string {
  return String((out.body as { error?: string } | undefined)?.error ?? '')
}

// Mock supabase for the helper-level entitlement proof (same shape as
// cpv2-entitlements.test.ts).
type Row = { data: unknown; error?: unknown }
function makeSupabase(opts: {
  user?: { id: string } | null
  tables?: Record<string, Row>
  rpc?: Record<string, Row>
}): any {
  const { user = null, tables = {}, rpc = {} } = opts
  return {
    auth: { getUser: async (_t: string) => ({ data: { user }, error: null }) },
    from(table: string) {
      const result: Row = tables[table] ?? { data: null }
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => result,
      }
      return builder
    },
    rpc: async (name: string, _args: unknown) => rpc[name] ?? { data: null, error: null },
  }
}

async function run() {
  const { socialStudioEnabled } = await import('../server/features.js')
  const { requireProductionOwnerOfClient, PRODUCTION_SUITE } = await import('../server/entitlements.js')
  const generateFeed = (await import('../api/generate-feed.js')).default
  const generateCampaign = (await import('../api/generate-campaign.js')).default
  const planEvent = (await import('../api/plan-event.js')).default
  const scoreImages = (await import('../api/score-images.js')).default
  const generateCaptions = (await import('../api/generate-captions.js')).default
  const appendEventPosts = (await import('../api/append-event-posts.js')).default

  // An "entitled-looking" request: everything a legitimate entitled owner
  // would send. The flag alone must reject it.
  const richBody = {
    clientId: 'c-1', galleryId: 'g-1', brief: { postTypes: ['single'] },
    photos: [{ filename: 'a.jpg' }], images: [{ id: 'i1' }],
  }
  const entitledReq = () => makeReq({
    origin: 'https://pixflow-ai.com', token: 'valid-looking-token', body: { ...richBody },
  })

  // ── socialStudioEnabled: fail closed, exact-match only ───────────────────
  delete process.env.FEATURE_SOCIAL_STUDIO
  ok('flag unset → disabled', socialStudioEnabled() === false)
  for (const v of ['1', 'TRUE', 'True', 'yes', 'on', '']) {
    process.env.FEATURE_SOCIAL_STUDIO = v
    ok(`flag '${v}' → still disabled (exact-match only)`, socialStudioEnabled() === false)
  }
  process.env.FEATURE_SOCIAL_STUDIO = 'true'
  ok(`flag 'true' → enabled`, socialStudioEnabled() === true)
  delete process.env.FEATURE_SOCIAL_STUDIO

  // ── Flag OFF: every Social handler → 403 feature_disabled ────────────────
  const handlers: Array<[string, (req: VercelRequest, res: VercelResponse) => unknown]> = [
    ['generate-feed', generateFeed],
    ['generate-campaign', generateCampaign],
    ['plan-event', planEvent],
    ['score-images', scoreImages],
    ['generate-captions', generateCaptions],
  ]
  for (const [name, h] of handlers) {
    const { res, out } = makeRes()
    await h(entitledReq(), res)
    ok(`flag off: ${name} → 403 feature_disabled (entitled-looking request)`, isFeatureDisabled(out), JSON.stringify(out))
  }
  {
    // Even with NO origin/method/body correctness, flag rejection comes first.
    const { res, out } = makeRes()
    await generateCaptions(makeReq({ method: 'GET' }), res)
    ok('flag off: generate-captions flag check precedes origin+method gates', isFeatureDisabled(out), JSON.stringify(out))
  }

  // append-event-posts: Social actions gated (including the implicit default)…
  for (const action of ['append_event_posts', 'choose_variant', 'unchoose_variant', 'save_post_edit', undefined]) {
    const { res, out } = makeRes()
    await appendEventPosts(makeReq({ body: { action, clientId: 'c-1', planId: 'p-1' } }), res)
    ok(`flag off: append-event-posts action=${action ?? '(default)'} → 403 feature_disabled`, isFeatureDisabled(out), JSON.stringify(out))
  }
  // …but the NON-Social actions are untouched (core gallery access).
  {
    const { res, out } = makeRes()
    await appendEventPosts(makeReq({ body: { action: 'verify_code' } }), res)
    ok('flag off: append-event-posts verify_code NOT feature-gated (400 clientId_required)',
      out.status === 400 && errOf(out) === 'clientId_required', JSON.stringify(out))
  }

  // ── Flag ON: handlers pass the flag gate to their NEXT gate ──────────────
  process.env.FEATURE_SOCIAL_STUDIO = 'true'
  {
    const { res, out } = makeRes()
    await generateFeed(makeReq({ body: {} }), res)
    ok('flag on: generate-feed → 400 clientId_required (past flag gate)',
      out.status === 400 && errOf(out) === 'clientId_required', JSON.stringify(out))
  }
  {
    const { res, out } = makeRes()
    await generateFeed(makeReq({ body: { clientId: 'c-1', brief: { postTypes: ['single'] } } }), res)
    ok('flag on: generate-feed, no token → 401 auth_required (entitlement chain reached)',
      out.status === 401 && errOf(out) === 'auth_required', JSON.stringify(out))
  }
  {
    const { res, out } = makeRes()
    await generateCampaign(makeReq({ body: { clientId: 'c-1', galleryId: 'g-1', brief: {} } }), res)
    ok('flag on: generate-campaign, no token → 401 auth_required',
      out.status === 401 && errOf(out) === 'auth_required', JSON.stringify(out))
  }
  {
    const { res, out } = makeRes()
    await planEvent(makeReq({ body: { clientId: 'c-1', galleryId: 'g-1' } }), res)
    ok('flag on: plan-event, no token → 401 auth_required',
      out.status === 401 && errOf(out) === 'auth_required', JSON.stringify(out))
  }
  {
    const { res, out } = makeRes()
    await scoreImages(makeReq({ body: { clientId: 'c-1' } }), res)
    ok('flag on: score-images, no token → 401 auth_required',
      out.status === 401 && errOf(out) === 'auth_required', JSON.stringify(out))
  }
  // append-event-posts social action passes to its ownership gates.
  {
    const { res, out } = makeRes()
    await appendEventPosts(makeReq({ body: { action: 'choose_variant' } }), res)
    ok('flag on: append-event-posts choose_variant → 400 clientId_required (past flag gate)',
      out.status === 400 && errOf(out) === 'clientId_required', JSON.stringify(out))
  }

  // ── generate-captions: NEW entitlement contract ───────────────────────────
  {
    // clientId is now REQUIRED (it previously accepted anonymous-tenant bodies).
    const { res, out } = makeRes()
    await generateCaptions(makeReq({ origin: 'https://pixflow-ai.com', body: { photos: [{ filename: 'a.jpg' }] } }), res)
    ok('flag on: generate-captions without clientId → 400 clientId_required',
      out.status === 400 && errOf(out) === 'clientId_required', JSON.stringify(out))
  }
  {
    // With a clientId but no session, the requireProductionOwnerOfClient chain
    // rejects at its first link — proof the entitlement gate is wired in.
    const { res, out } = makeRes()
    await generateCaptions(makeReq({ origin: 'https://pixflow-ai.com', body: { clientId: 'c-1', photos: [{ filename: 'a.jpg' }] } }), res)
    ok('flag on: generate-captions, no token → 401 auth_required (entitlement chain reached)',
      out.status === 401 && errOf(out) === 'auth_required', JSON.stringify(out))
  }

  // ── Helper-level: entitlement still denies un-entitled owners ────────────
  // (Same helper generate-captions now uses; mirrors cpv2-entitlements.test.ts.)
  {
    const sb = makeSupabase({
      user: { id: 'u1' },
      tables: {
        clients: { data: { id: 'c-1', business_id: 'biz' } },
        businesses: { data: { id: 'biz', user_id: 'u1' } },
      },
      rpc: { has_business_entitlement: { data: false } },
    })
    const r = await requireProductionOwnerOfClient(makeReq({ token: 't' }), sb, 'c-1')
    ok('owner WITHOUT production_suite → 403 entitlement_required',
      r.ok === false && r.status === 403 && r.code === 'entitlement_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({
      user: { id: 'u1' },
      tables: {
        clients: { data: { id: 'c-1', business_id: 'biz' } },
        businesses: { data: { id: 'biz', user_id: 'u1' } },
      },
      rpc: { has_business_entitlement: { data: true } },
    })
    const r = await requireProductionOwnerOfClient(makeReq({ token: 't' }), sb, 'c-1', PRODUCTION_SUITE)
    ok('owner WITH production_suite → ok', r.ok === true, JSON.stringify(r))
  }

  // Restore default-off so nothing later in the process inherits the flag.
  delete process.env.FEATURE_SOCIAL_STUDIO

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run()
