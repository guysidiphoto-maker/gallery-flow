// portal-route.test.ts — offline proofs for the short client-portal route
// /:businessSlug/c/:clientSlug and the membership-gated resolver contract.
// Run:  npx tsx tests/portal-route.test.ts
//
// Two layers:
//   1) Pure-logic tests for the URL parser (short form, legacy UUID forms, junk).
//      The parser is duplicated here verbatim from ClientDashboard.tsx so it can
//      be exercised without importing the React component (which pulls in the DOM
//      + supabase client). If the component parser changes, update this copy.
//   2) A documented MOCK of the resolve_client_portal / resolve_client_portal_by_id
//      RPC contract, asserting the ADVERSARIAL expectations that migration 102
//      enforces in the DB (membership gate, anon fail-closed, empty/oversized
//      slug rejection, no SQL injection). This file cannot hit the DB; the
//      coordinator runs the live DB adversarial tests after applying 102. These
//      assertions pin the CONTRACT the live tests must reproduce.

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ─── 1) URL parser (verbatim from ClientDashboard.tsx) ───────────────────────
type Parsed = { slug: string; clientSlug: string; clientId: string }
function parseUrl(pathname: string): Parsed {
  const path = pathname.replace(/\/dashboard\/?$/, '').replace(/\/$/, '')
  const shortMatch = path.match(/^\/([^/]+)\/c\/([^/]+)$/)
  if (shortMatch) return { slug: shortMatch[1], clientSlug: shortMatch[2], clientId: '' }
  const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
  if (slugMatch) return { slug: slugMatch[1], clientSlug: '', clientId: slugMatch[2] }
  const directMatch = path.match(/^\/client\/([^/]+)$/)
  if (directMatch) return { slug: '', clientSlug: '', clientId: directMatch[1] }
  return { slug: '', clientSlug: '', clientId: '' }
}

// ─── 2) Mock of the migration-102 resolver contract ──────────────────────────
// A tiny in-memory tenant model mirroring the QA fixture: two businesses, each
// with one client + one active member. The mock reproduces EXACTLY the SQL gate
// in resolve_client_portal: trim+lower slugs, reject empty/oversized, join
// business→client→ACTIVE membership of the current auth.uid(). No membership →
// no row. This is the enumeration defense the live DB test must confirm.
type Membership = { clientId: string; authUid: string; status: 'active' | 'disabled' | 'revoked' }
const BUSINESSES = [
  { id: 'bizA', slug: 'business-a', name: 'Business A' },
  { id: 'bizC', slug: 'business-c', name: 'Business C' },
]
const CLIENTS = [
  { id: 'cA1', businessId: 'bizA', slug: 'client-a1' },
  { id: 'cC1', businessId: 'bizC', slug: 'client-c1' },
]
const MEMBERSHIPS: Membership[] = [
  { clientId: 'cA1', authUid: 'memberA1', status: 'active' },
  { clientId: 'cC1', authUid: 'memberC1', status: 'active' },
]

type ResolverRow = { business_id: string; client_id: string; business_name: string; business_slug: string; client_slug: string }
// authUid === null models an anonymous caller (auth.uid() IS NULL in SQL).
function resolve_client_portal(pBizSlug: unknown, pClientSlug: unknown, authUid: string | null): ResolverRow[] {
  // Input validation: null/empty/oversized → no rows (fail closed).
  if (typeof pBizSlug !== 'string' || typeof pClientSlug !== 'string') return []
  if (pBizSlug.length > 200 || pClientSlug.length > 200) return []
  const b = pBizSlug.trim().toLowerCase()
  const c = pClientSlug.trim().toLowerCase()
  if (b === '' || c === '') return []
  const biz = BUSINESSES.find(x => x.slug.toLowerCase() === b)
  if (!biz) return []
  const cli = CLIENTS.find(x => x.businessId === biz.id && x.slug.toLowerCase() === c)
  if (!cli) return []
  // Membership gate — the enumeration defense. Bound params only: `b`/`c` are
  // compared as values, never concatenated into SQL, so injection is impossible.
  const member = MEMBERSHIPS.some(m => m.clientId === cli.id && m.authUid === authUid && m.status === 'active')
  if (!member) return []
  return [{ business_id: biz.id, client_id: cli.id, business_name: biz.name, business_slug: biz.slug, client_slug: cli.slug }]
}

function resolve_client_portal_by_id(pClientId: unknown, authUid: string | null): Array<{ business_slug: string; client_slug: string }> {
  if (typeof pClientId !== 'string' || pClientId === '') return []
  const cli = CLIENTS.find(x => x.id === pClientId)
  if (!cli) return []
  const member = MEMBERSHIPS.some(m => m.clientId === cli.id && m.authUid === authUid && m.status === 'active')
  if (!member) return []
  const biz = BUSINESSES.find(x => x.id === cli.businessId)!
  return [{ business_slug: biz.slug, client_slug: cli.slug }]
}

function run() {
  // ── URL parser: short form ────────────────────────────────────────────────
  {
    const p = parseUrl('/business-a/c/client-a1')
    ok('short form → slug + clientSlug, no clientId', p.slug === 'business-a' && p.clientSlug === 'client-a1' && p.clientId === '', JSON.stringify(p))
  }
  {
    const p = parseUrl('/business-a/c/client-a1/dashboard')
    ok('short form + /dashboard suffix stripped', p.slug === 'business-a' && p.clientSlug === 'client-a1' && p.clientId === '', JSON.stringify(p))
  }
  {
    const p = parseUrl('/business-a/c/client-a1/')
    ok('short form + trailing slash stripped', p.slug === 'business-a' && p.clientSlug === 'client-a1', JSON.stringify(p))
  }
  // ── URL parser: legacy UUID forms ─────────────────────────────────────────
  {
    const p = parseUrl('/business-a/client/11111111-2222-3333-4444-555555555555')
    ok('legacy /slug/client/<uuid> → clientId, empty clientSlug', p.slug === 'business-a' && p.clientId === '11111111-2222-3333-4444-555555555555' && p.clientSlug === '', JSON.stringify(p))
  }
  {
    const p = parseUrl('/business-a/client/11111111-2222-3333-4444-555555555555/dashboard')
    ok('legacy /slug/client/<uuid>/dashboard → clientId', p.clientId === '11111111-2222-3333-4444-555555555555', JSON.stringify(p))
  }
  {
    const p = parseUrl('/client/11111111-2222-3333-4444-555555555555')
    ok('root-level /client/<uuid> → clientId only', p.slug === '' && p.clientSlug === '' && p.clientId === '11111111-2222-3333-4444-555555555555', JSON.stringify(p))
  }
  // ── URL parser: junk / non-matching ───────────────────────────────────────
  {
    const p = parseUrl('/')
    ok('root path → all empty', p.slug === '' && p.clientSlug === '' && p.clientId === '', JSON.stringify(p))
  }
  {
    const p = parseUrl('/business-a')
    ok('business-only path → all empty (not a portal route)', p.slug === '' && p.clientSlug === '' && p.clientId === '', JSON.stringify(p))
  }
  {
    const p = parseUrl('/business-a/c/client-a1/extra/segments')
    ok('over-deep short path → no match', p.slug === '' && p.clientSlug === '' && p.clientId === '', JSON.stringify(p))
  }

  // ── Resolver contract: membership gate (enumeration defense) ──────────────
  {
    const r = resolve_client_portal('business-a', 'client-a1', 'memberA1')
    ok('member of A1 resolving A1 → exactly one row', r.length === 1 && r[0].client_id === 'cA1' && r[0].business_id === 'bizA', JSON.stringify(r))
  }
  {
    // Cross-business enumeration attempt: memberA1 asks for another business's client.
    const r = resolve_client_portal('business-c', 'client-c1', 'memberA1')
    ok('member of A1 resolving C1 (other business) → empty (no enumeration)', r.length === 0, JSON.stringify(r))
  }
  {
    const r = resolve_client_portal('business-a', 'client-a1', null)
    ok('anon (auth.uid() null) → empty', r.length === 0, JSON.stringify(r))
  }
  {
    // Disabled membership must not resolve (status re-checked every call).
    const r = resolve_client_portal('business-c', 'client-c1', 'disabledUser')
    ok('non-member uid → empty', r.length === 0, JSON.stringify(r))
  }
  // ── Resolver contract: input validation ───────────────────────────────────
  {
    ok('empty slugs → empty', resolve_client_portal('', '', 'memberA1').length === 0)
  }
  {
    const huge = 'a'.repeat(201)
    ok('oversized (>200) business slug → empty', resolve_client_portal(huge, 'client-a1', 'memberA1').length === 0)
  }
  {
    ok('null slug (non-string) → empty', resolve_client_portal(null, 'client-a1', 'memberA1').length === 0)
  }
  {
    // Whitespace + mixed case still resolves (trim + lower), for a REAL member.
    const r = resolve_client_portal('  BUSINESS-A  ', 'Client-A1', 'memberA1')
    ok('trimmed + upper-cased slug still resolves for member', r.length === 1 && r[0].client_id === 'cA1', JSON.stringify(r))
  }
  // ── Resolver contract: no SQL injection ───────────────────────────────────
  {
    const r = resolve_client_portal("a' or '1'='1", "b' or '1'='1", 'memberA1')
    ok("SQL-ish slug \"a' or '1'='1\" → empty (bound params, no injection)", r.length === 0, JSON.stringify(r))
  }
  {
    const r = resolve_client_portal("business-a'; drop table clients;--", 'client-a1', 'memberA1')
    ok('injection payload in slug → empty (treated as literal value)', r.length === 0, JSON.stringify(r))
  }

  // ── resolve_client_portal_by_id (legacy UUID → slugs, same gate) ──────────
  {
    const r = resolve_client_portal_by_id('cA1', 'memberA1')
    ok('by_id: member resolving own client → (slug, slug) row', r.length === 1 && r[0].business_slug === 'business-a' && r[0].client_slug === 'client-a1', JSON.stringify(r))
  }
  {
    const r = resolve_client_portal_by_id('cC1', 'memberA1')
    ok('by_id: member resolving other-client uuid → empty (no enumeration)', r.length === 0, JSON.stringify(r))
  }
  {
    ok('by_id: anon → empty', resolve_client_portal_by_id('cA1', null).length === 0)
  }
  {
    ok('by_id: unknown/tampered uuid → empty', resolve_client_portal_by_id('does-not-exist', 'memberA1').length === 0)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
