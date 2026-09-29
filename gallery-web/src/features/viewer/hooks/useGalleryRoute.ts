import { useMemo } from 'react'
import { parseGalleryPath } from '../lib/galleryRoute'

/** The gallery addressed by the current URL, parsed once per mount. */
export function useGalleryRoute() {
  return useMemo(() => parseGalleryPath(window.location.pathname), [])
}
