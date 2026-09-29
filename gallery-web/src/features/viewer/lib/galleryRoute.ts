export type GalleryRoute =
  | { type: 'slug'; businessSlug: string; gallerySlug: string; basePath: string }
  | { type: 'id'; value: string; basePath: string }

/**
 * Resolve the four public gallery URL forms. Each may carry one trailing
 * section-page segment; `basePath` is the gallery URL without it.
 */
export function parseGalleryPath(pathname: string): GalleryRoute | null {
  const path = pathname.replace(/\/+$/, '')
  const short = path.match(/^\/([^/]+)\/g\/([^/]+)(?:\/[^/]+)?$/)
  if (short) return { type: 'slug', businessSlug: short[1], gallerySlug: short[2], basePath: `/${short[1]}/g/${short[2]}` }
  const legacy = path.match(/^\/([^/]+)\/gallery\/([^/]+)(?:\/[^/]+)?$/)
  if (legacy) return { type: 'id', value: legacy[2], basePath: `/${legacy[1]}/gallery/${legacy[2]}` }
  const direct = path.match(/^\/gallery\/([^/]+)(?:\/[^/]+)?$/)
  if (direct) return { type: 'id', value: direct[1], basePath: `/gallery/${direct[1]}` }
  const clean = path.match(/^\/([^/]+)\/([^/]+)(?:\/[^/]+)?$/)
  if (clean) return { type: 'slug', businessSlug: clean[1], gallerySlug: clean[2], basePath: `/${clean[1]}/${clean[2]}` }
  return null
}
