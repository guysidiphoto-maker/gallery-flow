import { readCoverConfig } from '@/shared/gallery/coverImage'
import { Icon } from '@/shared/ui/Icon'
import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { imgUrl } from '../useCover'
import { tileStyle } from './designStyles'
import { CoverPreviews } from './CoverPreviews'
import { CoverGalleryPicker } from './CoverGalleryPicker'
import { CoverUploadDrop } from './CoverUploadDrop'

// Cover is independent of privacy: it is the public hero AND the blurred
// background of the private entry screen.
export function CoverImageSection() {
  const { settings: { updateGallerySetting }, cover } = useEditor()
  const { coverMode, setCoverMode, handleCoverRemove } = cover
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  const coverCfg = readCoverConfig(ds)
  const coverPreviewUrl =
    (ds.coverImageUrl as string | null) ||
    (coverCfg.path ? imgUrl(coverCfg.path) : null)
  const title = (ds.galleryTitle as string) || gallery.name
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: textPrimary, marginBottom: 3 }}>תמונת שער</div>
          <div style={{ fontSize: 11.5, color: textMuted, lineHeight: 1.5, maxWidth: 380 }}>
            תמונה גדולה בראש הגלריה. בגלריה פרטית היא מופיעה מטושטשת ואפלה ברקע מסך הכניסה, לאווירה יוקרתית בלי לחשוף את התוכן.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={coverCfg.enabled}
          aria-label="הצגת תמונת שער"
          onClick={() => {
            const next = !coverCfg.enabled
            if (next) updateGallerySetting('coverEnabled', true)
            else void handleCoverRemove()
          }}
          style={{
            flexShrink: 0, width: 46, height: 26, borderRadius: 999,
            border: 'none', cursor: 'pointer', position: 'relative',
            background: coverCfg.enabled ? textPrimary : '#cfcdc9',
            transition: 'background .18s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, insetInlineStart: coverCfg.enabled ? 23 : 3,
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            transition: 'inset-inline-start .18s',
            boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          }} />
        </button>
      </div>

      {coverCfg.enabled && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <CoverPreviews url={coverPreviewUrl} title={title} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setCoverMode('gallery')} style={tileStyle(coverMode === 'gallery')}>
              <Icon name="gallery" size={18} strokeWidth={coverMode === 'gallery' ? 1.85 : 1.4} />
              <div style={{ fontSize: 12.5, fontWeight: coverMode === 'gallery' ? 600 : 500, color: textPrimary }}>בחירה מהגלריה</div>
            </button>
            <button type="button" onClick={() => setCoverMode('upload')} style={tileStyle(coverMode === 'upload')}>
              <Icon name="photo" size={18} strokeWidth={coverMode === 'upload' ? 1.85 : 1.4} />
              <div style={{ fontSize: 12.5, fontWeight: coverMode === 'upload' ? 600 : 500, color: textPrimary }}>העלאת תמונה נפרדת</div>
            </button>
          </div>

          {coverMode === 'gallery' ? <CoverGalleryPicker /> : <CoverUploadDrop />}

          {coverCfg.source !== 'none' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 4 }}>
              <div style={{ fontSize: 11.5, color: textMuted }}>
                {coverCfg.source === 'custom_upload' ? 'שער: תמונה שהועלתה בנפרד' : 'שער: תמונה מתוך הגלריה'}
              </div>
              <button type="button" onClick={() => void handleCoverRemove()} style={{
                background: 'transparent', border: `1px solid ${border}`, borderRadius: 8,
                cursor: 'pointer', color: textPrimary, fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 500, padding: '6px 12px',
              }}>הסרת תמונת שער</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
