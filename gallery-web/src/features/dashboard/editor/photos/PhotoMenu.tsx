import type React from 'react'
import { Icon } from '@/shared/ui/Icon'
import { border, cardSolid, textMuted, textPrimary } from '../../styles'
import type { GalleryImage } from '../../types'
import { useEditor } from '../EditorContext'
import type { PhotoGridUI } from './usePhotoGridUI'

const itemStyle: React.CSSProperties = {
  width: '100%', textAlign: 'right' as const, padding: '8px 10px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, color: textPrimary,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const divider = <div style={{ height: 1, background: border, margin: '4px 0' }} />

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
      style={{
        position: 'absolute',
        top: menuOpenUpward ? undefined : 38,
        bottom: menuOpenUpward ? 38 : undefined,
        right: 8,
        background: cardSolid, border: `1px solid ${border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 5,
        minWidth: 180, padding: 4, direction: 'rtl' as const,
        maxHeight: 'min(60vh, 360px)', overflowY: 'auto',
      }}
    >
      {sections.length > 0 && (
        <>
          <div style={{
            padding: '8px 10px 4px', fontSize: 9, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: textMuted,
          }}>העבר לסט</div>
          {/* The photo's current set is not offered as a destination. */}
          {sections.filter(s => s.id !== img.section_id).map(s => (
            <button key={s.id} role="menuitem"
              onClick={() => { photos.moveImageToSection(img.id, s.id); setImageMenuOpenId(null) }}
              style={{
                width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                background: 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, color: textPrimary,
              }}>{s.name}</button>
          ))}
          {divider}
        </>
      )}
      {/* Keyboard alternative to drag; only meaningful under manual sort. */}
      {photos.photoSort === 'order' && (
        <>
          <button role="menuitem"
            onClick={() => { photos.moveImageStep(img.id, 'up'); setImageMenuOpenId(null) }}
            style={itemStyle}>
            <span>הזז קדימה</span>
            <span aria-hidden="true">↑</span>
          </button>
          <button role="menuitem"
            onClick={() => { photos.moveImageStep(img.id, 'down'); setImageMenuOpenId(null) }}
            style={itemStyle}>
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
          style={itemStyle}>
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
          style={itemStyle}>
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
        style={itemStyle}>
        <span>פתח</span>
        <Icon name="eye" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        onClick={() => { photos.downloadOriginal(img.id); setImageMenuOpenId(null) }}
        style={itemStyle}>
        <span>הורדה</span>
        <Icon name="download" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        onClick={() => { void photos.copyImageFilename(img.id); setImageMenuOpenId(null) }}
        title={img.filename || undefined}
        style={itemStyle}>
        <span>העתק שם קובץ</span>
        <Icon name="copy" size={13} strokeWidth={1.85} />
      </button>
      <button role="menuitem"
        disabled={replacing}
        onClick={() => { setImageMenuOpenId(null); photos.openReplacePicker(img.id) }}
        style={{
          ...itemStyle,
          cursor: replacing ? 'default' : 'pointer',
          opacity: replacing ? 0.5 : 1,
        }}>
        <span>{replacing ? 'מחליף…' : 'החלף תמונה'}</span>
        <Icon name="refresh" size={13} strokeWidth={1.85} />
      </button>
      {divider}
      <button role="menuitem"
        onClick={() => { photos.deleteSingleImage(img.id); setImageMenuOpenId(null) }}
        style={{ ...itemStyle, color: '#dc2626' }}>
        <span>מחיקה</span>
        <Icon name="trash" size={13} strokeWidth={1.85} />
      </button>
    </div>
  )
}
