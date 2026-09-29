export interface PortalPath {
  slug: string
  clientSlug: string
  clientId: string
}

/**
 * Supported portal URLs:
 *   /<biz>/c/<client-slug>            short form
 *   /<biz>/client/<uuid>[/dashboard]  legacy UUID
 *   /client/<uuid>[/dashboard]        root-level legacy UUID
 * Mirrored verbatim in tests/portal-route.test.ts.
 */
export function parsePortalPath(pathname: string): PortalPath {
  const path = pathname.replace(/\/dashboard\/?$/, '').replace(/\/$/, '')
  const shortMatch = path.match(/^\/([^/]+)\/c\/([^/]+)$/)
  if (shortMatch) return { slug: shortMatch[1], clientSlug: shortMatch[2], clientId: '' }
  const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
  if (slugMatch) return { slug: slugMatch[1], clientSlug: '', clientId: slugMatch[2] }
  const directMatch = path.match(/^\/client\/([^/]+)$/)
  if (directMatch) return { slug: '', clientSlug: '', clientId: directMatch[1] }
  return { slug: '', clientSlug: '', clientId: '' }
}
