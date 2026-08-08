// cpv2-clientadmin.test.ts — offline proofs for the owner-side helpers.
//   npx tsx tests/cpv2-clientadmin.test.ts

import {
  normalizeEmail, isValidEmail, sha256Hex, genInviteToken, inviteExpiryISO,
  isRole, isSettableStatus, requireOwnerBusiness, clientBelongsToBusiness, withinRateLimit,
} from '../server/clientAdmin.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

type Term = { data?: unknown; count?: number }
function makeReq(token?: string): any { return { headers: token ? { authorization: `Bearer ${token}` } : {} } }
function makeSupabase(opts: { user?: { id: string } | null; tables?: Record<string, Term> }): any {
  const { user = null, tables = {} } = opts
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no' } }) },
    from(table: string) {
      const t: Term = tables[table] ?? {}
      const builder: any = {
        select: () => builder, eq: () => builder, gte: () => builder,
        maybeSingle: async () => ({ data: t.data ?? null }),
        then: (r: (x: Term) => void) => r({ count: t.count ?? 0 }),
      }
      return builder
    },
  }
}

async function run() {
  // pure helpers
  ok('normalizeEmail trims+lowercases', normalizeEmail('  Foo@Bar.COM ') === 'foo@bar.com')
  ok('isValidEmail true', isValidEmail('a@b.co'))
  ok('isValidEmail false (no @)', !isValidEmail('nope'))
  ok('isValidEmail false (empty)', !isValidEmail(''))
  ok('sha256Hex deterministic', sha256Hex('abc') === sha256Hex('abc') && sha256Hex('abc').length === 64)
  ok('sha256Hex known vector', sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  {
    const { token, tokenHash } = genInviteToken()
    ok('genInviteToken hash matches token', sha256Hex(token) === tokenHash)
    ok('genInviteToken url-safe token', /^[A-Za-z0-9_-]+$/.test(token) && token.length >= 40)
    const { token: t2 } = genInviteToken()
    ok('genInviteToken unique', t2 !== token)
  }
  {
    const exp = new Date(inviteExpiryISO(0)).getTime()
    ok('inviteExpiryISO ~7 days', Math.abs(exp - 7 * 86400000) < 1000)
  }
  ok('isRole', isRole('viewer') && isRole('client_admin') && isRole('approver') && !isRole('root'))
  ok('isSettableStatus', isSettableStatus('active') && isSettableStatus('disabled') && isSettableStatus('revoked') && !isSettableStatus('invited'))

  // requireOwnerBusiness
  {
    const r = await requireOwnerBusiness(makeReq(), makeSupabase({}))
    ok('no token → 401', r.ok === false && r.status === 401)
  }
  {
    const r = await requireOwnerBusiness(makeReq('t'), makeSupabase({ user: { id: 'u1' }, tables: { businesses: { data: null } } }))
    ok('user without business → 404', r.ok === false && r.status === 404 && r.code === 'business_not_found')
  }
  {
    const r = await requireOwnerBusiness(makeReq('t'), makeSupabase({ user: { id: 'u1' }, tables: { businesses: { data: { id: 'bizA' } } } }))
    ok('owner → ok with businessId', r.ok === true && r.businessId === 'bizA')
  }

  // clientBelongsToBusiness
  {
    const yes = await clientBelongsToBusiness(makeSupabase({ tables: { clients: { data: { id: 'c1' } } } }), 'c1', 'bizA')
    const no = await clientBelongsToBusiness(makeSupabase({ tables: { clients: { data: null } } }), 'cX', 'bizA')
    ok('clientBelongsToBusiness true/false', yes === true && no === false)
  }

  // withinRateLimit
  {
    const under = await withinRateLimit(makeSupabase({ tables: { client_access_audit: { count: 3 } } }), 'bizA', 'invitation_sent', 5, 60)
    const over = await withinRateLimit(makeSupabase({ tables: { client_access_audit: { count: 5 } } }), 'bizA', 'invitation_sent', 5, 60)
    ok('withinRateLimit under max → true', under === true)
    ok('withinRateLimit at/over max → false', over === false)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
