import { lazy, Suspense } from 'react'
import type { GalleryImage } from '@/shared/types'
import type { Lang } from '@/shared/i18n/viewerStrings'
import type { FacePrivacyMode } from '../lib/viewerSettings'

// Mounted only after a guest opts in, so the camera pipeline stays out of the initial bundle.
const FaceSearchExperience = lazy(() =>
  import('../face-search/FaceSearchExperience').then(m => ({ default: m.FaceSearchExperience })),
)

/** Full-screen face search, opened from the welcome screen or the toolbar. */
export function FaceSearchOverlay({ galleryId, images, storageUrl, privacyMode, lang, onClose, onSelfieCapture, onMatches, onBrowseAll }: {
  galleryId: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  privacyMode: FacePrivacyMode
  /** Omitted from the toolbar entry, which then uses the component's default. */
  lang?: Lang
  onClose: () => void
  onSelfieCapture: (url: string) => void
  onMatches: (ids: string[], serverImages: unknown[]) => void
  onBrowseAll: () => void
}) {
  return (
    <Suspense fallback={null}>
      <FaceSearchExperience
        galleryId={galleryId}
        backgroundImages={images.slice(0, 6)}
        storageUrl={storageUrl}
        privacyMode={privacyMode}
        lang={lang}
        onClose={onClose}
        onSelfieCapture={onSelfieCapture}
        onMatches={onMatches}
        onBrowseAll={onBrowseAll}
      />
    </Suspense>
  )
}
