import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import type { GalleryImage } from '../../types'
import { useEditor } from '../EditorContext'
import type { PhotoGridUI } from './usePhotoGridUI'

const plainItem = 'w-full cursor-pointer bg-transparent px-2.5 py-2 text-right text-[12px] text-ink'
const item = cn(plainItem, 'flex items-center justify-between')

const divider = <div className="my-1 h-px bg-line" />

// Per-tile action menu. Anchored to the tile's physical right edge so in RTL
// it grows into the grid instead of clipping at the screen edge.
export function PhotoMenu({ img, visibleImages, isCover, ui }: {
  img: GalleryImage
  visibleImages: GalleryImage[]
  isCover: boolean
  ui: PhotoGridUI
}) {
  const { session, photos, cover, showToast } = useEditor()
  const { sections } = session
  const { photoMenuRef, menuOpenUpward, setImageMenuOpenId } = ui
  const replacing = photos.replacingImageId === img.id

  return (
    <div
      ref={photoMenuRef}
      role="menu"
      aria-orientation="vertical"
      aria-label="פעולות תמונה"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const items = Array.from(
          photoMenuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
        )
        if (!items.length) return
        const cur = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown'
          ? (cur + 1) % items.length
          : (cur - 1 + items.length) % items.length
        items[next]?.focus({ preventScroll: true })
      }}
      className={cn(
        'absolute right-2 z-[5] max-h-[min(60vh,360px)] min-w-[180px] overflow-y-auto border border-line bg-raised p-1 shadow-card [direction:rtl]',
        menuOpenUpward ? 'bottom-[38px]' : 'top-[38px]',
      )}
    >
      {sections.length > 0 && (
        <>
          <div className="px-2.5 pt-2 pb-1 text-[9px] font-medium tracking-label text-muted uppercase">העבר לסט</div>
          {/* The photo's current set is not offered as a destination. */}
          {sections.filter(s => s.id !== img.section_id).map(s => (
            <button key={s.id} role="menuitem"
              onClick={() => { photos.moveImageToSection(img.id, s.id); setImageMenuOpenId(null) }}
              className={plainItem}>{s.name}</button>
          ))}
          {divider}
        </>
      )}
      {/* Keyboard alternative to drag; only meaningful under manual sort. */}
      {photos.photoSort === 'order' && (
        <>
          <button role="menuitem"
            onClick={() => { photos.moveImageStep(img.id, 'up'); setImageMenuOpenId(null) }}
            className={item}>
            <span>הזז קדימה</span>
            <span aria-hidden="true">↑</span>
          </button>
          <button role="menuitem"
            onClick={() => { photos.moveImageStep(img.id, 'down'); setImageMenuOpenId(null) }}
            className={item}>
            <span>הזז אחורה</span>
            <span aria-hidden="true">↓</span>
          </button>
          {divider}
        </>
      )}
      {isCover ? (
        <button role="menuitem"
          onClick={() => {
            setImageMenuOpenId(null)
            void (async () => {
              await cover.handleCoverRemove()
              showToast({ kind: 'success', text: 'תמונת השער הוסרה' })
            })()
          }}
          className={item}>
          <span>הסר תמונת קאבר</span>
          <Icon name="close" size={13} strokeWidth={1.85} />
        </button>
      ) : (
        <button role="menuitem"
          onClick={() => {
            setImageMenuOpenId(null)
            void (async () => {
              const ok = await cover.selectGalleryCover(img)
              if (ok) showToast({ kind: 'success', text: 'הוגדר כתמונת השער' })
            })()
          }}
          className={item}>
          <span>הגדר כתמונת קאבר</span>
          <Icon name="photo" size={13} strokeWidth={1.85} />
        </button>
      )}
      {divider}
      <button role="menuitem"
        onClick={() => {
          setImageMenuOpenId(null)
          photos.openViewer(visibleImages, img.id)
        }}
        className={item}>
        <span>פתח</span>
        <Icon name="eye" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        onClick={() => { photos.downloadOriginal(img.id); setImageMenuOpenId(null) }}
        className={item}>
        <span>הורדה</span>
        <Icon name="download" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        onClick={() => { void photos.copyImageFilename(img.id); setImageMenuOpenId(null) }}
        title={img.filename || undefined}
        className={item}>
        <span>העתק שם קובץ</span>
        <Icon name="copy" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        disabled={replacing}
        onClick={() => { setImageMenuOpenId(null); photos.openReplacePicker(img.id) }}
        className={cn(item, replacing && 'cursor-default opacity-50')}>
        <span>{replacing ? 'מחליף…' : 'החלף תמונה'}</span>
        <Icon name="refresh" size={13} strokeWidth={1.85} />
      </button>
      {divider}
      <button role="menuitem"
        onClick={() => { photos.deleteSingleImage(img.id); setImageMenuOpenId(null) }}
        className={cn(item, 'text-danger-strong')}>
        <span>מחיקה</span>
        <Icon name="trash" size={13} strokeWidth={1.85} />
      </button>
    </div>
  )
}
