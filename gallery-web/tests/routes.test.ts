// routes.test.ts — locks URL → page matching (incl. legacy URLs) during refactors.
// Run:  npx tsx tests/routes.test.ts
import { resolveRoute, isMarketingRoute } from '../src/app/routes.ts'
import { LANDING_PAGES } from '../seo/content.ts'
import { LANDING_PATHS } from '../seo/landingPaths.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const CASES: Array<[string, ReturnType<typeof resolveRoute>]> = [
  ['/', 'home'],
  ['/home-legacy', 'home-legacy'],
  ['/photographers', 'photographers'],
  ['/photographers/', 'photographers'],
  // The retired Mac-app landing: unknown now, so the app sends it home.
  ['/en', null],
  ['/en/', null],
  ['/face-recognition-photo-gallery', 'seo-landing'],
  ['/blog', 'blog-index'],
  ['/blog/', 'blog-index'],
  ['/blog/some-post', 'blog-post'],
  ['/demo', 'demo'],
  ['/pricing', 'pricing'],
  ['/terms', 'terms'],
  ['/privacy', 'privacy'],
  ['/dashboard', 'dashboard'],
  ['/studio-settings', 'studio-settings'],
  ['/brand-kit', 'brand-kit'],
  ['/admin', 'admin'],
  ['/admin/', 'admin'],
  ['/client-invite/accept', 'client-invite-accept'],
  ['/client-login', 'client-login'],
  ['/q/abc', 'questionnaire'],
  ['/event/abc', 'event-capture'],
  ['/vendor/CODE', 'vendor'],
  ['/eclipse/vendor/CODE', 'vendor'],
  ['/eclipse/c/pro-market', 'client-portal'],
  ['/eclipse/client/uuid/dashboard', 'client-portal'],
  ['/client/uuid/dashboard', 'client-portal'],
  ['/client/uuid', 'portfolio'],
  ['/eclipse/client/uuid', 'portfolio'],
  ['/gallery/uuid', 'gallery'],
  ['/eclipse/gallery/uuid', 'gallery'],
  ['/eclipse/g/wedding', 'gallery'],
  ['/eclipse/g/wedding/ceremony', 'gallery'],
  ['/eclipse/wedding', 'gallery'],
  ['/eclipse/wedding/ceremony', 'gallery'],
  ['/demo/', null],
  ['/a/b/c/d', null],
]
for (const [path, want] of CASES) {
  const got = resolveRoute(path)
  ok(`${path} → ${want}`, got === want, `got ${got}`)
}

for (const { path } of LANDING_PAGES) ok(`landing ${path} → seo-landing`, resolveRoute(path) === 'seo-landing')
ok('landing path list matches content', LANDING_PATHS.size === LANDING_PAGES.length)

ok('pixel on marketing', isMarketingRoute('home') && isMarketingRoute('blog-post') && isMarketingRoute('seo-landing'))
ok('no pixel on product pages', !isMarketingRoute('gallery') && !isMarketingRoute('dashboard') && !isMarketingRoute(null))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
