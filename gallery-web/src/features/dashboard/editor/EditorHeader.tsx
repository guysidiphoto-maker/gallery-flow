import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, statusLive, textMuted, textPrimary, textSecondary } from '../styles'
import { useEditor, useOpenGallery } from './EditorContext'
import { GalleryMoreMenu } from './GalleryMoreMenu'
import { PublishButton } from './PublishButton'

// Name + status on the start side; Preview / Copy Link / More / Publish on the end.
export function EditorHeader() {
  const { session, actions } = useEditor()
  const gallery = useOpenGallery()
  const { galleryImages, copiedInEditor, setEditingGallery, copyEditorLink } = session
  const isLiveStatus = gallery.status === 'live'

  return (
    <div
      className="dash-editor-header"
      style={{
        padding: '18px 32px', borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: bgSubtle,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => setEditingGallery(null)} aria-label="חזרה" style={{
          background: 'none', border: 'none', color: textSecondary, cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
        }}>
          <Icon name="close" size={18} strokeWidth={1.85} />
        </button>
        <div>
          <h2 id="gallery-editor-heading" style={{ fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: '-0.015em', color: textPrimary }}>
            {gallery.name}
          </h2>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
            fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: textMuted,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isLiveStatus ? statusLive : border,
            }} />
            <span>{isLiveStatus ? 'Published' : 'Draft'}</span>
            <span style={{ color: border, marginInline: 2 }}>·</span>
            <span>{galleryImages.length} תמונות</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href={actions.shareUrl(gallery)} target="_blank" style={{
          padding: '10px 18px', borderRadius: 2, fontSize: 11, fontWeight: 500,
          background: 'transparent', border: `1px solid ${border}`, color: textPrimary,
          textDecoration: 'none', fontFamily: 'inherit',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="arrow-out" size={13} strokeWidth={1.85} />
          Preview
        </a>
        {isLiveStatus && (
          <button
            onClick={() => copyEditorLink(actions.shareUrl(gallery), gallery.id)}
            aria-live="polite"
            style={{
              padding: '10px 18px', borderRadius: 2, fontSize: 11, fontWeight: 500,
              background: copiedInEditor ? 'rgba(45,196,121,.10)' : 'transparent',
              border: `1px solid ${copiedInEditor ? 'rgba(45,196,121,.45)' : border}`,
              color: copiedInEditor ? '#1b8a4e' : textPrimary,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'background .15s, border-color .15s, color .15s',
            }}
          >
            <Icon name={copiedInEditor ? 'check' : 'copy'} size={13} strokeWidth={1.85} />
            {copiedInEditor ? 'הקישור הועתק' : 'Copy Link'}
          </button>
        )}
        <GalleryMoreMenu />
        <PublishButton />
      </div>
    </div>
  )
}
