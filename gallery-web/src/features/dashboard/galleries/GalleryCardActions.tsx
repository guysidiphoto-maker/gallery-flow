import type React from 'react'
import { Icon } from '@/shared/ui/Icon'
import type { GalleryActions } from '../hooks/useGalleryActions'
import { textPrimary } from '../styles'
import type { Gallery } from '../types'

const actionButton: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 2,
  background: 'rgba(255,255,255,.96)',
  border: `1px solid rgba(20,20,19,.08)`,
  color: textPrimary, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(8px)',
  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
}

// Hover overlay on a gallery card: delete (every gallery) and, for live
// galleries, copy link / email share / duplicate.
export function GalleryCardActions({ gallery: g, isLive, actions, onOpenEmailShare }: {
  gallery: Gallery
  isLive: boolean
  actions: GalleryActions
  onOpenEmailShare: (g: Gallery) => void
}) {
  const { copyGalleryLink, copiedGalleryId, duplicateGallery, duplicatingId, deleteGallery } = actions
  return (
    <>
      <div style={{
        position: 'absolute', top: 12, insetInlineEnd: 12,
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); void deleteGallery(g) }}
          title="מחק גלריה"
          aria-label="מחק גלריה"
          style={{ ...actionButton, color: '#c0392b' }}
        >
          <Icon name="trash" size={14} strokeWidth={1.85} />
        </button>
      </div>
      {isLive && (
        <div style={{
          position: 'absolute', bottom: 12, insetInlineStart: 12,
          display: 'flex', gap: 6,
        }}>
          <button
            onClick={(e) => copyGalleryLink(g.id, e)}
            title="העתק קישור"
            aria-label={copiedGalleryId === g.id ? 'הקישור הועתק' : 'העתק קישור'}
            style={actionButton}
          >
            <Icon name={copiedGalleryId === g.id ? 'check' : 'copy'} size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEmailShare(g) }}
            title="שלח במייל ללקוח"
            aria-label="שלח במייל ללקוח"
            style={actionButton}
          >
            <Icon name="mail" size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); duplicateGallery(g) }}
            disabled={duplicatingId === g.id}
            title="שכפל גלריה"
            aria-label="שכפל גלריה"
            style={{
              ...actionButton,
              cursor: duplicatingId === g.id ? 'wait' : 'pointer',
              opacity: duplicatingId === g.id ? 0.6 : 1,
            }}
          >
            <Icon name="duplicate" size={14} strokeWidth={1.85} />
          </button>
        </div>
      )}
    </>
  )
}
