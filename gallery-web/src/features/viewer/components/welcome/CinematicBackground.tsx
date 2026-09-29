import { cn } from '@/shared/ui'
import type { GalleryImage } from '@/shared/types'
import { CoverBackdrop } from '../CoverBackdrop'

export function CinematicBackground({ images, isPrivate, getUrl, galleryTitle, coverImageUrl, coverCrop, gateCoverUrl }: {
  images: GalleryImage[]
  isPrivate: boolean
  getUrl: (path: string) => string
  galleryTitle: string
  coverImageUrl?: string | null
  coverCrop?: { zoom: number; x: number; y: number } | null
  gateCoverUrl?: string | null
}) {
  // Private entry reuses the password gate's cover treatment when a cover exists.
  if (isPrivate && gateCoverUrl) return <CoverBackdrop coverUrl={gateCoverUrl} />
  const bgSrc = coverImageUrl || (images.length > 0 ? getUrl(images[0].thumbnail_path || images[0].storage_path) : null)
  return (
    <>
      {bgSrc && (
        <div
          className={cn(
            'wc-cine absolute inset-[-10%] animate-[wcCineFadeIn_2.5s_ease_.2s_both,wcCineZoom_20s_ease-in-out_infinite_alternate]',
            isPrivate ? '[--wc-cine-target:0.08] blur-[50px] saturate-[.2]' : '[--wc-cine-target:0.55] blur-[8px] saturate-[1.1]',
          )}
        >
          {/* Decorative when private: the blur makes it unrecognisable. */}
          <img
            src={bgSrc}
            alt={isPrivate ? '' : `${galleryTitle} cover photo`}
            className="block size-full object-cover"
            style={coverCrop ? { objectPosition: `${50 + (coverCrop.x || 0)}% ${50 + (coverCrop.y || 0)}%` } : undefined}
          />
        </div>
      )}
      <div className="gv-welcome-vignette pointer-events-none absolute inset-0" />
      {!isPrivate && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              className={cn('absolute bottom-[-5%] rounded-full bg-white/40', i % 3 === 0 ? 'size-[2px]' : 'size-px')}
              style={{
                left: `${(i * 37 + 13) % 100}%`,
                animation: `wcParticle ${8 + (i % 7) * 2}s linear ${i * 0.7}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
