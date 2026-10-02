// Route table: first match wins, so order matters (specific paths before the
// multi-segment gallery catch-alls). Pure data — see tests/routes.test.ts.
import { LANDING_PATHS } from '../../seo/landingPaths'

export type RouteId =
  | 'home' | 'home-legacy' | 'photographers' | 'seo-landing'
  | 'blog-index' | 'blog-post' | 'demo' | 'pricing' | 'terms' | 'privacy'
  | 'dashboard' | 'studio-settings' | 'brand-kit' | 'admin'
  | 'client-invite-accept' | 'client-login' | 'client-portal' | 'portfolio'
  | 'questionnaire' | 'event-capture' | 'vendor' | 'gallery'

type Matcher = (path: string, trimmed: string) => boolean

const exact = (...paths: string[]): Matcher => (_p, t) => paths.includes(t)

const ROUTES: ReadonlyArray<readonly [RouteId, Matcher]> = [
  ['home', p => p === '/'],
  ['home-legacy', p => p === '/home-legacy'],
  ['photographers', exact('/photographers')],
  ['seo-landing', (_p, t) => LANDING_PATHS.has(t)],
  ['blog-index', exact('/blog')],
  ['blog-post', p => p.startsWith('/blog/')],
  ['demo', p => p === '/demo'],
  ['pricing', p => p === '/pricing'],
  ['dashboard', p => p === '/dashboard'],
  ['studio-settings', p => p === '/studio-settings'],
  ['brand-kit', p => p === '/brand-kit'],
  ['admin', exact('/admin')],
  ['client-invite-accept', exact('/client-invite/accept')],
  ['client-login', exact('/client-login')],
  ['terms', p => p === '/terms'],
  ['privacy', p => p === '/privacy'],
  ['questionnaire', p => p.startsWith('/q/')],
  ['event-capture', p => p.startsWith('/event/')],
  ['vendor', p => p.startsWith('/vendor/') || /^\/[^/]+\/vendor\//.test(p)],
  // Client portal: short /<biz>/c/<client> and legacy /client/<id>/dashboard.
  ['client-portal', p => /^\/[^/]+\/c\/[^/]+\/?$/.test(p) || /\/client\/[^/]+\/dashboard/.test(p)],
  ['portfolio', p => p.startsWith('/client/') || /^\/[^/]+\/client\//.test(p)],
  // Gallery: /gallery/:id, /:biz/gallery/:id, /:biz/g/:slug[/:section], /:biz/:slug[/:section].
  ['gallery', p =>
    p.startsWith('/gallery') ||
    /^\/[^/]+\/gallery\//.test(p) ||
    /^\/[^/]+\/g\/[^/]+(?:\/[^/]+)?\/?$/.test(p) ||
    /^\/[^/]+\/[^/]+(?:\/[^/]+)?\/?$/.test(p)],
]

/** Resolve a pathname to its route id, or null (the app redirects to `/`). */
export function resolveRoute(path: string): RouteId | null {
  const trimmed = path.replace(/\/+$/, '') || '/'
  for (const [id, match] of ROUTES) if (match(path, trimmed)) return id
  return null
}

/** Marketing pages are the only place the ad pixel may load. */
const MARKETING: ReadonlySet<RouteId> = new Set([
  'home', 'home-legacy', 'photographers', 'seo-landing',
  'blog-index', 'blog-post', 'demo', 'pricing',
])
export const isMarketingRoute = (id: RouteId | null) => id !== null && MARKETING.has(id)
