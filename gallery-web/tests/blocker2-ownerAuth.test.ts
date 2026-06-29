// blocker2-ownerAuth.test.ts — deterministic offline proof of the AI-endpoint
// auth gate's fail-closed contract. Run:  npx tsx tests/blocker2-ownerAuth.test.ts
//
// Proves, WITHOUT network/AI, that:
//   • a missing Bearer token → 401 BEFORE any Supabase/DB call
//   • a bad token → 401 (token validated, rejected) before any DB ownership read
//   • a valid user whose target client belongs to ANOTHER business → 403 (cross-tenant)
//   • the happy path (owner) → ok, returns the server-verified businessId
// i.e. no DB/AI work ever happens before auth + ownership pass.

import {
  getBearerToken,
  requireAuthedUser,
  requireBusinessOwnerOfClient,
} from '../server/ownerAuth.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// Mock supabase that COUNTS calls so we can prove ordering (nothing runs pre-auth).
function makeSupabase(opts: any = {}) {
  const calls = { getUser: 0, from: [] as string[] }
  return {
    calls,
    auth: {
      async getUser(_t: string) {
        calls.getUser++
        return { data: { user: opts.user ?? null }, error: opts.userErr ?? null }
      },
    },
    from(table: string) {
      calls.from.push(table)
      const b: any = {
        select() { return b }, eq() { return b },
        async maybeSingle() {
          if (table === 'clients') return { data: opts.client ?? null }
          if (table === 'businesses') return { data: opts.business ?? null }
          return { data: null }
        },
      }
      return b
    },
  } as any
}
const reqWith = (auth?: string) => ({ headers: auth ? { authorization: auth } : {} }) as any

// 1. getBearerToken parsing
ok('no header → null token', getBearerToken(reqWith()) === null)
ok('"Bearer abc" → abc', getBearerToken(reqWith('Bearer abc')) === 'abc')
ok('case-insensitive "bearer abc" → abc', getBearerToken(reqWith('bearer abc')) === 'abc')
ok('bare token (no scheme) → null', getBearerToken(reqWith('abc')) === null)

await (async () => {
  // 2. requireAuthedUser: no token → 401 and getUser NEVER called
  const sb = makeSupabase()
  const r: any = await requireAuthedUser(reqWith(), sb)
  ok('no token → 401 auth_required', r.ok === false && r.status === 401 && r.code === 'auth_required')
  ok('no token → getUser NOT called (fail-closed before network)', sb.calls.getUser === 0)

  // 3. requireBusinessOwnerOfClient: no token → 401 and NO db query (no AI/DB pre-auth)
  const sb2 = makeSupabase()
  const r2: any = await requireBusinessOwnerOfClient(reqWith(), sb2, 'client-1')
  ok('owner gate, no token → 401', r2.ok === false && r2.status === 401)
  ok('owner gate, no token → ZERO db reads before auth', sb2.calls.from.length === 0)

  // 4. bad token (getUser returns error) → 401 invalid_token, no db read
  const sb3 = makeSupabase({ userErr: { message: 'bad jwt' } })
  const r3: any = await requireBusinessOwnerOfClient(reqWith('Bearer bad'), sb3, 'client-1')
  ok('bad token → 401 invalid_token', r3.ok === false && r3.status === 401 && r3.code === 'invalid_token')
  ok('bad token → no ownership db read', sb3.calls.from.length === 0)

  // 5. valid user, client not found → 404
  const sb4 = makeSupabase({ user: { id: 'user-A' }, client: null })
  const r4: any = await requireBusinessOwnerOfClient(reqWith('Bearer good'), sb4, 'missing')
  ok('valid user, unknown client → 404', r4.ok === false && r4.status === 404 && r4.code === 'client_not_found')

  // 6. CROSS-TENANT: valid user-A, but client's business is owned by user-B → 403
  const sb5 = makeSupabase({
    user: { id: 'user-A' },
    client: { id: 'c1', business_id: 'biz-B' },
    business: { id: 'biz-B', user_id: 'user-B' },
  })
  const r5: any = await requireBusinessOwnerOfClient(reqWith('Bearer good'), sb5, 'c1')
  ok('cross-tenant client → 403 forbidden', r5.ok === false && r5.status === 403 && r5.code === 'forbidden')

  // 7. HAPPY PATH: owner of the client's business → ok + server-verified businessId
  const sb6 = makeSupabase({
    user: { id: 'user-A' },
    client: { id: 'c1', business_id: 'biz-A' },
    business: { id: 'biz-A', user_id: 'user-A' },
  })
  const r6: any = await requireBusinessOwnerOfClient(reqWith('Bearer good'), sb6, 'c1')
  ok('owner → ok, returns verified businessId', r6.ok === true && r6.businessId === 'biz-A' && r6.userId === 'user-A')
})()

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
