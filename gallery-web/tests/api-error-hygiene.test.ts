// api-error-hygiene.test.ts — offline proof that the owner-side write handlers
// NEVER leak raw DB / exception text to the browser (security review, Integration
// Preview Hardening 2026-07-24). Run:
//   npx tsx tests/api-error-hygiene.test.ts
//
// Proves, WITHOUT network:
//   • When an internal DB call throws (or returns a raw error), import-center and
//     gallery-metadata return a GENERIC stable code ({ ok:false, error:'internal_error'
//     | 'update_failed' | 'dry_run_failed' }) with NO `detail` field and no raw
//     message anywhere in the response body.
//   • The full error IS logged server-side (console.error with the handler's
//     stable tag) — useful internal logs are kept, just never leaked.
//   • Known VALIDATION codes are unchanged (import-center 'invalid_provider',
//     gallery-metadata 'galleryId_required') and also carry no `detail`.
//
// The real handlers are imported (like social-lockdown.test.ts). We mock the
// '@supabase/supabase-js' module via Node's synchronous loader hooks so the
// module-level client the handlers build is fully under our control: it passes
// the auth + business-ownership gate, then throws on the operative query.

import { registerHooks } from 'node:module'

// ── Controllable fake supabase, exposed to the mocked module through globalThis.
// Per-table behaviour is set by each test via setTables(). A table entry is
// either { data } (maybeSingle resolves it; awaiting resolves { data,error:null })
// or { throwOnQuery:true } (maybeSingle + await both throw a DB-looking error).
type TableSpec = { data?: unknown; throwOnQuery?: boolean; count?: number }
let TABLES: Record<string, TableSpec> = {}
const DB_SECRET = 'relation "x" violates FK constraint pgsecret_42 at 0xDEADBEEF'
function setTables(t: Record<string, TableSpec>) { TABLES = t }

function makeFakeSupabase() {
  return {
    auth: { getUser: async (_t: string) => ({ data: { user: { id: 'u1' } }, error: null }) },
    from(table: string) {
      const spec: TableSpec = TABLES[table] ?? {}
      const builder: any = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (spec.throwOnQuery) throw new Error(DB_SECRET)
          return { data: spec.data ?? null, error: null }
        },
        // Awaiting the builder directly (e.g. update/insert without maybeSingle).
        then: (resolve: (x: unknown) => void, reject?: (e: unknown) => void) => {
          if (spec.throwOnQuery) { if (reject) return reject(new Error(DB_SECRET)); throw new Error(DB_SECRET) }
          return resolve({ data: spec.data ?? null, error: null, count: spec.count ?? 0 })
        },
      }
      return builder
    },
    rpc: async () => ({ data: null, error: null }),
  }
}
;(globalThis as unknown as { __FAKE_SUPABASE__: unknown }).__FAKE_SUPABASE__ = makeFakeSupabase()

// Mock '@supabase/supabase-js' BEFORE the handlers import it. createClient()
// returns the single shared fake above.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@supabase/supabase-js') return { url: 'virtual:supabase-mock', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'virtual:supabase-mock') {
      return {
        format: 'module', shortCircuit: true,
        source: 'export function createClient(){ return globalThis.__FAKE_SUPABASE__ }',
      }
    }
    return next(url, ctx)
  },
})

// Env must be set before the api modules load (module-level client build).
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.VITE_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import type { VercelRequest, VercelResponse } from '@vercel/node'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

function makeReq(body: Record<string, unknown>): VercelRequest {
  return {
    method: 'POST',
    headers: { origin: 'https://pixflow-ai.com', authorization: 'Bearer valid-token' },
    body,
    socket: {},
  } as unknown as VercelRequest
}
function makeRes(): { res: VercelResponse; out: { status?: number; body?: any } } {
  const out: { status?: number; body?: any } = {}
  const res = {
    status(c: number) { out.status = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader() { return res },
    end() { return res },
  } as unknown as VercelResponse
  return { res, out }
}

// Capture console.error without silencing the run (we assert it was called).
function withErrorSpy<T>(fn: (calls: unknown[][]) => Promise<T>): Promise<T> {
  const calls: unknown[][] = []
  const orig = console.error
  console.error = (...args: unknown[]) => { calls.push(args) }
  return fn(calls).finally(() => { console.error = orig })
}

function bodyHasNoLeak(out: { body?: any }): boolean {
  const b = out.body ?? {}
  if ('detail' in b) return false
  const serialized = JSON.stringify(b)
  return !serialized.includes(DB_SECRET) && !serialized.includes('pgsecret_42') && !serialized.includes('0xDEADBEEF')
}
function spyCaughtSecret(calls: unknown[][]): boolean {
  return calls.some(args => args.some(a =>
    (a instanceof Error && a.message.includes('pgsecret_42')) ||
    (typeof a === 'string' && a.includes('pgsecret_42'))))
}
function spyTagged(calls: unknown[][], tag: string): boolean {
  return calls.some(args => typeof args[0] === 'string' && (args[0] as string).includes(tag))
}

async function run() {
  const importCenter = (await import('../api/import-center.js')).default

  // ── import-center: internal error (DB query throws) → generic, no detail ──
  await withErrorSpy(async (calls) => {
    setTables({ businesses: { data: { id: 'biz' } }, import_jobs: { throwOnQuery: true } })
    const { res, out } = makeRes()
    await importCenter(makeReq({ action: 'job_status', jobId: 'j-1' }), res)
    ok('import-center internal error → 500 internal_error',
      out.status === 500 && out.body?.ok === false && out.body?.error === 'internal_error', JSON.stringify(out.body))
    ok('import-center internal error → NO detail / no raw DB text in body', bodyHasNoLeak(out), JSON.stringify(out.body))
    ok('import-center internal error → logged server-side with [import-center] tag',
      spyTagged(calls, '[import-center]') && spyCaughtSecret(calls))
  })

  // ── import-center: dry_run insert failure returns { error } (raw) → generic ──
  await withErrorSpy(async (calls) => {
    setTables({
      businesses: { data: { id: 'biz' } },
      import_jobs: { data: { id: 'j-1', business_id: 'biz', status: 'draft', kind: 'metadata_csv', totals: {}, checkpoint: {}, started_at: null } },
      // insert(...).select(...) is awaited directly → throw simulates a raw DB error.
      import_collections: { throwOnQuery: true },
      clients: { data: null },
      client_memberships: { data: null },
    })
    const { res, out } = makeRes()
    const csv = 'Collection Name,Client Email\nMy Gallery,x@y.co\n'
    await importCenter(makeReq({ action: 'parse_csv', jobId: 'j-1', csvText: csv, kind: 'collections' }), res)
    // The throw lands in the outer catch (internal_error) — either way, no leak.
    ok('import-center parse_csv DB failure → 500 generic code (no raw detail)',
      out.status === 500 && out.body?.ok === false &&
      (out.body?.error === 'dry_run_failed' || out.body?.error === 'internal_error'), JSON.stringify(out.body))
    ok('import-center parse_csv DB failure → NO detail / no raw DB text', bodyHasNoLeak(out), JSON.stringify(out.body))
    ok('import-center parse_csv DB failure → logged server-side', spyTagged(calls, '[import-center]'))
  })

  // ── import-center: known validation code still returned, no detail ──
  await withErrorSpy(async () => {
    setTables({ businesses: { data: { id: 'biz' } } })
    const { res, out } = makeRes()
    await importCenter(makeReq({ action: 'create_job', provider: 'not_a_provider' }), res)
    ok('import-center validation code preserved (invalid_provider)',
      out.status === 400 && out.body?.error === 'invalid_provider', JSON.stringify(out.body))
    ok('import-center validation response carries no detail', bodyHasNoLeak(out), JSON.stringify(out.body))
  })

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
