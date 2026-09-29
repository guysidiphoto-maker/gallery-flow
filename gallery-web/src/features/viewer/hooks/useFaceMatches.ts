import { useState } from 'react'
import type { GalleryImage } from '@/shared/types'
import type { FacePrivacyMode } from '../lib/viewerSettings'

/**
 * Face-search results: matched ids are kept once found, and the filter toggles
 * between "your photos" and everything without losing them.
 */
export function useFaceMatches(opts: {
  facePrivacyMode: FacePrivacyMode
  setImages: (images: GalleryImage[]) => void
  closeWelcome: () => void
}) {
  const [faceMatchIds, setFaceMatchIds] = useState<Set<string> | null>(null)
  const [faceFilterActive, setFaceFilterActive] = useState(false)
  const [showFaceSearch, setShowFaceSearch] = useState(false)
  const [faceSelfieUrl, setFaceSelfieUrl] = useState<string | null>(null)

  const onMatches = (ids: string[], serverImages: unknown[]) => {
    setFaceMatchIds(new Set(ids))
    setFaceFilterActive(true)
    setShowFaceSearch(false)
    // Private mode skipped the bulk fetch: the server-hydrated matches are the only rows.
    if (opts.facePrivacyMode === 'private' && serverImages.length > 0) {
      opts.setImages(serverImages as unknown as GalleryImage[])
    }
    if (ids.length > 0) opts.closeWelcome()
  }

  const onBrowseAll = () => {
    setShowFaceSearch(false)
    opts.closeWelcome()
  }

  return {
    faceMatchIds,
    faceFilterActive,
    setFaceFilterActive,
    showFaceSearch,
    openFaceSearch: () => setShowFaceSearch(true),
    closeFaceSearch: () => setShowFaceSearch(false),
    faceSelfieUrl,
    setFaceSelfieUrl,
    onMatches,
    onBrowseAll,
  }
}
