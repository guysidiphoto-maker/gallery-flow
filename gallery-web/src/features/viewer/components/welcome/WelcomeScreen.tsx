import { useState } from 'react'
import { cn } from '@/shared/ui'
import type { GalleryImage } from '@/shared/types'
import type { Lang } from '@/shared/i18n/viewerStrings'
import type { AnimationSpeed, FacePrivacyMode, TextAnimation, WelcomeStyle } from '../../lib/viewerSettings'
import { WelcomeContent } from './WelcomeContent'
import { MosaicBackground } from './MosaicBackground'
import { CinematicBackground } from './CinematicBackground'
import { MinimalBackground } from './MinimalBackground'

export interface WelcomeScreenProps {
  style?: WelcomeStyle
  galleryTitle: string
  galleryDescription?: string
  welcomeMessage?: string
  textAnimation?: TextAnimation
  animationSpeed?: AnimationSpeed
  eventDate?: string
  eventLocation?: string
  clientName: string
  studioName: string
  studioWebsite?: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  coverImageUrl?: string | null
  coverCrop?: { zoom: number; x: number; y: number } | null
  /** Private face-search entry only: switches the cinematic bg to the gate's cover treatment. */
  gateCoverUrl?: string | null
  onEnter: () => void
  faceSearchAvailable: boolean
  facePrivacyMode: FacePrivacyMode | null
  onFindMyPhotos: () => void
  lang?: Lang
  headingFont?: string
  bodyFont?: string
}

/** Full-screen cover shown before the grid; doubles as a loading buffer for the first thumbnails. */
export function WelcomeScreen({
  style = 'mosaic', textAnimation = 'blur', animationSpeed = 'normal', lang = 'he',
  images, storageUrl: getUrl, coverImageUrl, coverCrop, gateCoverUrl, onEnter,
  faceSearchAvailable, facePrivacyMode, onFindMyPhotos, ...content
}: WelcomeScreenProps) {
  const [entered, setEntered] = useState(false)
  const isPrivate = faceSearchAvailable && facePrivacyMode === 'private'

  const handleEnter = () => {
    setEntered(true)
    setTimeout(onEnter, 600)
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-black transition-opacity duration-700 ease-[ease]',
        entered ? 'opacity-0' : 'opacity-100',
      )}
    >
      {style === 'mosaic' && <MosaicBackground images={images} isPrivate={isPrivate} getUrl={getUrl} />}
      {style === 'cinematic' && (
        <CinematicBackground
          images={images}
          isPrivate={isPrivate}
          getUrl={getUrl}
          galleryTitle={content.galleryTitle}
          coverImageUrl={coverImageUrl}
          coverCrop={coverCrop}
          gateCoverUrl={gateCoverUrl}
        />
      )}
      {style === 'minimal' && <MinimalBackground />}

      {isPrivate && (
        <div className="gv-welcome-accent-line pointer-events-none absolute top-1/2 h-px w-[20%] animate-[wcLine_3.5s_ease-in-out_infinite]" />
      )}

      <WelcomeContent
        {...content}
        style={style}
        textAnimation={textAnimation}
        animationSpeed={animationSpeed}
        lang={lang}
        isPrivate={isPrivate}
        showFindButton={faceSearchAvailable && facePrivacyMode !== null}
        onEnter={handleEnter}
        onFindMyPhotos={onFindMyPhotos}
      />
    </div>
  )
}
