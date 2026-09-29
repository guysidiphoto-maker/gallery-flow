import { readCoverConfig } from '@/shared/gallery/coverImage'
import { SignedImg } from '@/shared/ui/SignedImg'
import { cn } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'

// First 48 gallery photos as cover candidates.
export function CoverGalleryPicker() {
  const { session: { galleryImages }, cover: { selectGalleryCover } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  const coverCfg = readCoverConfig(ds)
  if (galleryImages.length === 0) {
    return (
      <div className="py-2.5 text-[12px] text-muted">
        אין עדיין תמונות בגלריה. העלו תמונות, או בחרו "העלאת תמונה נפרדת".
      </div>
    )
  }
  return (
    <div className="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1 overflow-y-auto">
      {galleryImages.slice(0, 48).map(img => {
        const isCover =
          coverCfg.source === 'gallery_asset' &&
          ((ds.coverImagePath as string | undefined) === img.storage_path ||
            (ds.coverImageId as string | undefined) === img.id)
        return (
          <button key={img.id}
            type="button"
            onClick={() => void selectGalleryCover(img)}
            aria-label={isCover ? 'תמונת שער נוכחית' : 'הגדר כתמונת שער'}
            aria-pressed={isCover}
            className={cn(
              'aspect-[4/3] overflow-hidden bg-transparent p-0 transition-[outline-offset,opacity] duration-150',
              isCover ? 'opacity-100 outline-2 -outline-offset-2 outline-ink' : 'opacity-92 outline-none',
            )}>
            <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
              alt="" loading="lazy"
              className="block size-full object-cover" />
          </button>
        )
      })}
    </div>
  )
}
