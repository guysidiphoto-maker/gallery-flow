// cpv2-membership.test.ts — deterministic offline proof of the client-membership
// authorization gate's fail-closed contract. Run:
//   npx tsx tests/cpv2-membership.test.ts
//
// Proves, WITHOUT network:
//   • no Bearer token → 401 auth_required
//   • bad token → 401 invalid_token
//   • valid user but NO active membership row → 403 no_active_membership
//     (the query filters status='active', so disabled/revoked members — which
//      return no row — are rejected here; access is re-checked every request)
//   • valid active member → ok, returns server-verified business_id + role
//   • resolveActiveMemberships maps only what the query returns

import { requireActiveMembership, resolveActiveMemberships } from '../server/membership.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

type Row = { data: unknown; error?: unknown }
function makeReq(token?: string): any {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} }
}
// Records the .eq() filters so we can prove status='active' is always applied.
function makeSupabase(opts: { user?: { id: string } | null; userErr?: unknown; row?: Row }): any {
  const { user = null, userErr = null, row = { data: null } } = opts
  const eqCalls: Array<[string, unknown]> = []
  const sb: any = {
    __eqCalls: eqCalls,
    auth: {
      getUser: async (_t: string) =>
        userErr ? { data: { user: null }, error: userErr } : { data: { user }, error: null },
    },
    from(_table: string) {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return builder },
        maybeSingle: async () => row,
        then: (res: (r: Row) => void) => res(row),
      }
      return builder
    },
  }
  return sb
}

async function run() {
  {
    const sb = makeSupabase({})
    const r = await requireActiveMembership(makeReq(), sb, 'clientA')
    ok('no token → 401 auth_required', r.ok === false && r.status === 401 && r.code === 'auth_required', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ userErr: { message: 'bad' } })
    const r = await requireActiveMembership(makeReq('x'), sb, 'clientA')
    ok('bad token → 401 invalid_token', r.ok === false && r.status === 401 && r.code === 'invalid_token', JSON.stringify(r))
  }
  {
    const sb = makeSupabase({ user: { id: 'u1' }, row: { data: null } })
    const r = await requireActiveMembership(makeReq('t'), sb, 'clientA')
    ok('no active membership → 403', r.ok === false && r.status === 403 && r.code === 'no_active_membership', JSON.stringify(r))
    ok('gate always filters status=active', sb.__eqCalls.some((c: [string, unknown]) => c[0] === 'status' && c[1] === 'active'))
    ok('gate scopes to caller uid', sb.__eqCalls.some((c: [string, unknown]) => c[0] === 'auth_user_id' && c[1] === 'u1'))
    ok('gate scopes to requested client', sb.__eqCalls.some((c: [string, unknown]) => c[0] === 'client_id' && c[1] === 'clientA'))
  }
  {
    const sb = makeSupabase({
      user: { id: 'u1' },
      row: { data: { id: 'm1', client_id: 'clientA', business_id: 'bizA', role: 'viewer', status: 'active', auth_user_id: 'u1' } },
    })
    const r = await requireActiveMembership(makeReq('t'), sb, 'clientA')
    ok('active member → ok with verified business + role',
      r.ok === true && r.businessId === 'bizA' && r.clientId === 'clientA' && r.membershipId === 'm1' && r.role === 'viewer',
      JSON.stringify(r))
  }
  {
    // resolveActiveMemberships maps rows; a disabled member never appears
    // because the query filters status='active' (the mock returns only actives).
    const sb = makeSupabase({
      user: { id: 'u1' },
      row: { data: [
        { id: 'm1', client_id: 'cA', business_id: 'bA', role: 'client_admin', status: 'active' },
        { id: 'm2', client_id: 'cB', business_id: 'bB', role: 'viewer', status: 'active' },
      ] },
    })
    const rows = await resolveActiveMemberships(sb, 'u1')
    ok('resolveActiveMemberships maps all active rows', rows.length === 2 && rows[0].clientId === 'cA' && rows[1].businessId === 'bB')
    ok('one person → many clients supported', rows[0].clientId !== rows[1].clientId)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run()
