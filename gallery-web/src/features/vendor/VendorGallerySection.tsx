import { forwardRef } from 'react'
import { SignedImg } from '@/shared/ui/SignedImg'
import { cn } from '@/shared/ui'
import type { GalleryInfo, TaggedImage } from './useVendorPortal'

export const VendorGallerySection = forwardRef<HTMLDivElement, {
  gallery: GalleryInfo | undefined
  images: TaggedImage[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
}>(function VendorGallerySection({ gallery, images, selectedIds, onToggle }, ref) {
  const d = gallery?.published_at ? new Date(gallery.published_at) : null
  return (
    <div ref={ref} className="mb-10">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h2 className="m-0 text-[18px] font-semibold">{gallery?.name || 'Gallery'}</h2>
        {d && (
          <span className="text-[12px] text-white/35">
            {d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        )}
        <span className="text-[12px] text-white/25">{images.length} photos</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 overflow-hidden rounded-[8px]">
        {images.map(img => (
          <PhotoTile key={img.id} image={img} selected={selectedIds.has(img.id)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  )
})

function PhotoTile({ image, selected, onToggle }: {
  image: TaggedImage
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div onClick={() => onToggle(image.id)} className="relative aspect-square cursor-pointer overflow-hidden">
      <SignedImg
        bucket="gallery-images"
        path={image.thumbnail_path || image.storage_path}
        alt="" loading="lazy"
        className={cn(
          'block size-full object-cover transition-[opacity,transform] duration-[150ms,300ms]',
          selected ? 'opacity-100' : 'opacity-45 hover:opacity-70',
        )}
      />
      {/* Physical right on purpose: the corner badge doesn't mirror in RTL. */}
      <div
        className={cn(
          'absolute top-1.5 right-1.5 flex size-[22px] items-center justify-center rounded-full transition-all duration-150',
          selected ? 'bg-brand' : 'border-2 border-white/40 bg-black/40',
        )}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  )
}
