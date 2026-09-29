import { readCoverConfig } from '@/shared/gallery/coverImage'
import { SignedImg } from '@/shared/ui/SignedImg'
import { textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'

// First 48 gallery photos as cover candidates.
export function CoverGalleryPicker() {
  const { session: { galleryImages }, cover: { selectGalleryCover } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  const coverCfg = readCoverConfig(ds)
  if (galleryImages.length === 0) {
    return (
      <div style={{ fontSize: 12, color: textMuted, padding: '10px 0' }}>
        אין עדיין תמונות בגלריה. העלו תמונות, או בחרו "העלאת תמונה נפרדת".
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
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
            style={{
              padding: 0, border: 'none', background: 'transparent',
              aspectRatio: '4 / 3', overflow: 'hidden', cursor: 'pointer',
              outline: isCover ? `2px solid ${textPrimary}` : 'none',
              outlineOffset: isCover ? -2 : 0,
              opacity: isCover ? 1 : 0.92,
              transition: 'outline-offset .15s, opacity .15s',
            }}>
            <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
              alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        )
      })}
    </div>
  )
}
