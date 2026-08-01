// cpv2-adversarial.test.ts — offline adversarial proofs for the Client Portal V2
// authorization gates. Run:  npx tsx tests/cpv2-adversarial.test.ts
//
// Covers the unit-testable rows of the program Test Matrix:
//   • non-Production business calls a Production API directly → 403 entitlement_required
//   • valid user whose client belongs to ANOTHER business → 403 forbidden (cross-tenant)
//   • anonymous (no JWT) calls a Production API → 401
//   • unknown client id (tampered) → 404, never leaks
//   • entitled owner → ok
// DB-enforced rows (disabled/revoked session reuse, empty-clientCode bypass,
// expired/hijacked invite, cross-client URL) require applied migrations and are
// in docs/CLIENT-PORTAL-V2-QA-CHECKLIST.md.

import { requireProductionOwnerOfClient, PRODUCTION_SUITE } from '../server/entitlements.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

type Row = { data: unknown }
function makeReq(token?: string): any { return { headers: token ? { authorization: `Bearer ${token}` } : {} } }
// requireBusinessOwnerOfClient reads clients then businesses (two from() calls),
// then resolveEntitlement calls rpc('has_business_entitlement').
function makeSupabase(opts: {
  user?: { id: string } | null; userErr?: unknown
  client?: Row['data']; business?: Row['data']; entitled?: boolean
}): any {
  const { user = null, userErr = null, client = null, business = null, entitled = false } = opts
  return {
    auth: { getUser: async () => userErr ? { data: { user: null }, error: userErr } : { data: { user }, error: null } },
    from(table: string) {
      const data = table === 'clients' ? client : table === 'businesses' ? business : null
      const b: any = { select: () => b, eq: () => b, maybeSingle: async () => ({ data }) }
      return b
    },
    rpc: async (_n: string, _a: unknown) => ({ data: entitled, error: null }),
  }
}

async function run() {
  const CLIENT = { id: 'cA', business_id: 'bizA' }

  {
    const sb = makeSupabase({}) // no user
    const r = await requireProductionOwnerOfClient(makeReq(), sb, 'cA', PRODUCTION_SUITE)
    ok('anon → 401 (no Production access)', r.ok === false && r.status === 401, JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'u1' }, client: null })
    const r = await requireProductionOwnerOfClient(makeReq('t'), sb, 'TAMPERED', PRODUCTION_SUITE)
    ok('tampered/unknown client → 404 client_not_found', r.ok === false && r.status === 404 && r.code === 'client_not_found', JSON.stringify(r))
  }
  {
    // client belongs to bizA owned by SOMEONE ELSE → cross-tenant reject before entitlement
    const sb = makeSupabase({ user: { id: 'attacker' }, client: CLIENT, business: { id: 'bizA', user_id: 'realOwner' }, entitled: true })
    const r = await requireProductionOwnerOfClient(makeReq('t'), sb, 'cA', PRODUCTION_SUITE)
    ok('cross-tenant owner → 403 forbidden', r.ok === false && r.status === 403 && r.code === 'forbidden', JSON.stringify(r))
  }
  {
    // legitimate owner, but business NOT entitled → Production blocked (default deny)
    const sb = makeSupabase({ user: { id: 'u1' }, client: CLIENT, business: { id: 'bizA', user_id: 'u1' }, entitled: false })
    const r = await requireProductionOwnerOfClient(makeReq('t'), sb, 'cA', PRODUCTION_SUITE)
    ok('owner, non-Production business → 403 entitlement_required', r.ok === false && r.status === 403 && r.code === 'entitlement_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'u1' }, client: CLIENT, business: { id: 'bizA', user_id: 'u1' }, entitled: true })
    const r = await requireProductionOwnerOfClient(makeReq('t'), sb, 'cA', PRODUCTION_SUITE)
    ok('owner + entitled → ok', r.ok === true && r.businessId === 'bizA', JSON.stringify(r))
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
