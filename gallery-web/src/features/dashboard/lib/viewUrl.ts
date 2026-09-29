import type { DashboardView } from '../types'

const VIEWS: readonly DashboardView[] = ['overview', 'galleries', 'clients', 'search', 'import', 'brand-kit']
const DEFAULT_VIEW: DashboardView = 'galleries'
const BRAND_KIT_PATH = '/brand-kit'

// The tab lives in the URL (/dashboard?tab=search, /brand-kit) so a refresh
// reopens it; galleries is the bare /dashboard.
export function readViewFromUrl(): DashboardView {
  if (typeof window === 'undefined') return DEFAULT_VIEW
  if (window.location.pathname.replace(/\/+$/, '') === BRAND_KIT_PATH) return 'brand-kit'
  const tab = new URLSearchParams(window.location.search).get('tab')
  return (VIEWS as readonly string[]).includes(tab ?? '') ? (tab as DashboardView) : DEFAULT_VIEW
}

/** replaceState only: tab switches must not pile up history entries. */
export function writeViewToUrl(view: DashboardView) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.delete('tab')
  let path = '/dashboard'
  if (view === 'brand-kit') path = BRAND_KIT_PATH
  else if (view !== DEFAULT_VIEW) params.set('tab', view)
  const query = params.toString()
  const next = `${path}${query ? `?${query}` : ''}${window.location.hash}`
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', next)
  }
}
