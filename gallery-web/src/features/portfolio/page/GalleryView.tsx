import { SignedImg } from '@/shared/ui/SignedImg'
import { readStr, type GalleryRow, type ImageRow } from './lib'

/** Top-pick highlights of a single gallery. */
export function GalleryView({ gallery, photos, reveal }: {
  gallery: GalleryRow
  photos: ImageRow[]
  reveal: (el: HTMLElement | null) => void
}) {
  const location = readStr(gallery.delivery_settings, 'eventLocation')
  return (
    <div className="animate-[pp-view-fade-in_.7s_cubic-bezier(.16,1,.3,1)_both] pt-[120px] pb-20">
      <div className="mb-[60px] px-6 text-center">
        <div className="mb-3 text-[10px] tracking-[.3em] text-white/35 uppercase">{photos.length} Highlights</div>
        <h2 className="text-[clamp(24px,3.5vw,44px)] font-normal tracking-[.04em]">{gallery.name}</h2>
        {location && <div className="mt-2.5 text-xs tracking-[.15em] text-white/30 uppercase">{location}</div>}
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fill,minmax(min(100%,350px),1fr))] gap-1 px-6">
        {photos.map((img, i) => (
          <div key={img.id} ref={reveal} data-delay={i * 60} className="pf-thumb">
            <SignedImg
              bucket="gallery-images"
              path={img.thumbnail_path || img.storage_path}
              alt=""
              className="block h-auto w-full"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
