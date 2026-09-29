import { displayUrl } from '@/shared/lib/supabase'

// Covers may still point at a multi-MB original; route gallery-images objects
// through the bounded, CDN-cached transform so the grid never pulls full-res.
const CARD_COVER_WIDTH = 640

export function cardCoverUrl(url: string): string {
  const marker = '/storage/v1/object/public/gallery-images/'
  const i = url.indexOf(marker)
  if (i === -1) return url
  const path = url.slice(i + marker.length) // keep URL-encoding + slashes intact
  return displayUrl('gallery-images', path, CARD_COVER_WIDTH)
}
