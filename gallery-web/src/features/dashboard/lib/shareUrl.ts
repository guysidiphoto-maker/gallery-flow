// Short share URL /<business>/<gallery-slug>; falls back to the legacy
// /gallery/<id> form when either slug is missing (old links keep working).
export function galleryShareUrl(businessSlug: string | null, g: { id: string; slug?: string | null }): string {
  const origin = window.location.origin
  return businessSlug && g.slug
    ? `${origin}/${businessSlug}/${g.slug}`
    : `${origin}/gallery/${g.id}`
}
