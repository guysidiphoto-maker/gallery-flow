// blocker2-ownerAuth.test.ts — owner JWT gate fails closed before any network call.
// Run:  npx tsx tests/blocker2-ownerAuth.test.ts

import {
  getBearerToken,
  requireAuthedUser,
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
})()

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
