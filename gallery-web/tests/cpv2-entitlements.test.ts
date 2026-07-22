// cpv2-entitlements.test.ts — deterministic offline proof of the Production Suite
// entitlement gate's fail-closed contract. Run:
//   npx tsx tests/cpv2-entitlements.test.ts
//
// Proves, WITHOUT network:
//   • no Bearer token → 401 auth_required (before any DB/RPC work)
//   • bad token → 401 invalid_token
//   • unknown business → 404
//   • valid user who does NOT own the business → 403 forbidden
//   • valid owner without an active entitlement → 403 entitlement_required
//   • valid owner WITH an active entitlement → ok
//   • resolveEntitlement fails CLOSED on RPC error / non-true data
//   • requireResolvedEntitlement (membership path) gates on entitlement only

import {
  resolveEntitlement,
  requireOwnerEntitlement,
  requireResolvedEntitlement,
  PRODUCTION_SUITE,
} from '../server/entitlements.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

type Row = { data: unknown; error?: unknown }
function makeReq(token?: string): any {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} }
}
function makeSupabase(opts: {
  user?: { id: string } | null
  userErr?: unknown
  tables?: Record<string, Row>
  rpc?: Record<string, Row>
}): any {
  const { user = null, userErr = null, tables = {}, rpc = {} } = opts
  return {
    auth: {
      getUser: async (_t: string) =>
        userErr ? { data: { user: null }, error: userErr } : { data: { user }, error: null },
    },
    from(table: string) {
      const result: Row = tables[table] ?? { data: null }
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        maybeSingle: async () => result,
        then: (res: (r: Row) => void) => res(result),
      }
      return builder
    },
    rpc: async (name: string, _args: unknown) => rpc[name] ?? { data: null, error: null },
  }
}

async function run() {
  // ── resolveEntitlement: fail closed ──────────────────────────────────────
  {
    const sb = makeSupabase({ rpc: { has_business_entitlement: { data: true } } })
    ok('resolveEntitlement true when RPC true', (await resolveEntitlement(sb, 'biz', PRODUCTION_SUITE)) === true)
  }
  {
    const sb = makeSupabase({ rpc: { has_business_entitlement: { data: false } } })
    ok('resolveEntitlement false when RPC false', (await resolveEntitlement(sb, 'biz', PRODUCTION_SUITE)) === false)
  }
  {
    const sb = makeSupabase({ rpc: { has_business_entitlement: { data: null, error: { message: 'boom' } } } })
    ok('resolveEntitlement fails CLOSED on RPC error', (await resolveEntitlement(sb, 'biz', PRODUCTION_SUITE)) === false)
  }
  {
    const sb = makeSupabase({})
    ok('resolveEntitlement fails CLOSED on empty businessId', (await resolveEntitlement(sb, '', PRODUCTION_SUITE)) === false)
  }

  // ── requireOwnerEntitlement ──────────────────────────────────────────────
  {
    const sb = makeSupabase({})
    const r = await requireOwnerEntitlement(makeReq(), sb, 'biz', PRODUCTION_SUITE)
    ok('no token → 401 auth_required', r.ok === false && r.status === 401 && r.code === 'auth_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ userErr: { message: 'bad' } })
    const r = await requireOwnerEntitlement(makeReq('x'), sb, 'biz', PRODUCTION_SUITE)
    ok('bad token → 401 invalid_token', r.ok === false && r.status === 401 && r.code === 'invalid_token', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'u1' }, tables: { businesses: { data: null } } })
    const r = await requireOwnerEntitlement(makeReq('t'), sb, 'bizX', PRODUCTION_SUITE)
    ok('unknown business → 404', r.ok === false && r.status === 404 && r.code === 'business_not_found', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'u1' }, tables: { businesses: { data: { id: 'biz', user_id: 'OTHER' } } } })
    const r = await requireOwnerEntitlement(makeReq('t'), sb, 'biz', PRODUCTION_SUITE)
    ok('non-owner → 403 forbidden', r.ok === false && r.status === 403 && r.code === 'forbidden', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({
      user: { id: 'u1' },
      tables: { businesses: { data: { id: 'biz', user_id: 'u1' } } },
      rpc: { has_business_entitlement: { data: false } },
    })
    const r = await requireOwnerEntitlement(makeReq('t'), sb, 'biz', PRODUCTION_SUITE)
    ok('owner, not entitled → 403 entitlement_required', r.ok === false && r.status === 403 && r.code === 'entitlement_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({
      user: { id: 'u1' },
      tables: { businesses: { data: { id: 'biz', user_id: 'u1' } } },
      rpc: { has_business_entitlement: { data: true } },
    })
    const r = await requireOwnerEntitlement(makeReq('t'), sb, 'biz', PRODUCTION_SUITE)
    ok('owner + entitled → ok', r.ok === true && r.businessId === 'biz' && r.capability === PRODUCTION_SUITE, JSON.stringify(r))
  }

  // ── requireResolvedEntitlement (client-member path) ──────────────────────
  {
    const sb = makeSupabase({ user: { id: 'm1' }, rpc: { has_business_entitlement: { data: true } } })
    const r = await requireResolvedEntitlement(makeReq('t'), sb, 'biz', PRODUCTION_SUITE)
    ok('resolved + entitled → ok', r.ok === true, JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'm1' }, rpc: { has_business_entitlement: { data: false } } })
    const r = await requireResolvedEntitlement(makeReq('t'), sb, 'biz', PRODUCTION_SUITE)
    ok('resolved + not entitled → 403', r.ok === false && r.status === 403 && r.code === 'entitlement_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ rpc: { has_business_entitlement: { data: true } } })
    const r = await requireResolvedEntitlement(makeReq(), sb, 'biz', PRODUCTION_SUITE)
    ok('resolved path still requires JWT → 401', r.ok === false && r.status === 401, JSON.stringify(r))
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run()
