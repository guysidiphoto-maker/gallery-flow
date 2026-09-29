import { displayUrl } from '@/shared/lib/supabase'

// Covers can point at a multi-MB original (until derivatives are backfilled),
// which made the grid download full-res images for every card. Route
// gallery-images objects through the bounded, CDN-cached transform instead;
// other URLs pass through untouched.
const CARD_COVER_WIDTH = 640

export function cardCoverUrl(url: string): string {
  const marker = '/storage/v1/object/public/gallery-images/'
  const i = url.indexOf(marker)
  if (i === -1) return url
  const path = url.slice(i + marker.length) // keep URL-encoding + slashes intact
  return displayUrl('gallery-images', path, CARD_COVER_WIDTH)
}
