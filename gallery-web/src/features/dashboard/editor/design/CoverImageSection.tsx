import { readCoverConfig } from '@/shared/gallery/coverImage'
import { Icon } from '@/shared/ui/Icon'
import { OptionTile } from '@/shared/ui/OptionTile'
import { Toggle, cn } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'
import { imgUrl } from '../useCover'
import { tileClass } from './designStyles'
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-[3px] text-[13.5px] font-semibold text-ink">תמונת שער</div>
          <div className="max-w-[380px] text-[11.5px] leading-normal text-muted">
            תמונה גדולה בראש הגלריה. בגלריה פרטית היא מופיעה מטושטשת ואפלה ברקע מסך הכניסה, לאווירה יוקרתית בלי לחשוף את התוכן.
          </div>
        </div>
        <Toggle
          checked={coverCfg.enabled}
          label="הצגת תמונת שער"
          onChange={next => {
            if (next) updateGallerySetting('coverEnabled', true)
            else void handleCoverRemove()
          }}
          className="h-[26px] w-[46px] p-[3px]"
        />
      </div>

      {coverCfg.enabled && (
        <div className="mt-[18px] flex flex-col gap-[18px]">
          <CoverPreviews url={coverPreviewUrl} title={title} />

          <div className="grid grid-cols-2 gap-2">
            <OptionTile type="button" selected={coverMode === 'gallery'} onClick={() => setCoverMode('gallery')} className={tileClass}>
              <Icon name="gallery" size={18} strokeWidth={coverMode === 'gallery' ? 1.85 : 1.4} />
              <div className={cn('text-[12.5px] text-ink', coverMode === 'gallery' ? 'font-semibold' : 'font-medium')}>בחירה מהגלריה</div>
            </OptionTile>
            <OptionTile type="button" selected={coverMode === 'upload'} onClick={() => setCoverMode('upload')} className={tileClass}>
              <Icon name="photo" size={18} strokeWidth={coverMode === 'upload' ? 1.85 : 1.4} />
              <div className={cn('text-[12.5px] text-ink', coverMode === 'upload' ? 'font-semibold' : 'font-medium')}>העלאת תמונה נפרדת</div>
            </OptionTile>
          </div>

          {coverMode === 'gallery' ? <CoverGalleryPicker /> : <CoverUploadDrop />}

          {coverCfg.source !== 'none' && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11.5px] text-muted">
                {coverCfg.source === 'custom_upload' ? 'שער: תמונה שהועלתה בנפרד' : 'שער: תמונה מתוך הגלריה'}
              </div>
              <button type="button" onClick={() => void handleCoverRemove()}
                className="rounded-[8px] border border-line bg-transparent px-3 py-1.5 text-[11.5px] font-medium text-ink">
                הסרת תמונת שער
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
