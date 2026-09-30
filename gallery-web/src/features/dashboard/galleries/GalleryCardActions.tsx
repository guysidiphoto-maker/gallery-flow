import { Icon } from '@/shared/ui/Icon'
import type { GalleryActions } from '../hooks/useGalleryActions'
import { cn } from '@/shared/ui'
import type { Gallery } from '../types'

const actionButton =
  'flex size-[34px] cursor-pointer items-center justify-center rounded-hair border border-ink/8 bg-white/96 text-ink ' +
  'shadow-[0_1px_3px] shadow-black/6 backdrop-blur-[8px] transition-colors hover:border-ink/30'

// Hidden until the card is hovered or a button inside it gets keyboard focus;
// not clickable while hidden, so a tap on the card can't hit an invisible delete.
const reveal =
  'pointer-events-none opacity-0 transition-opacity duration-150 ' +
  'group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'

// Hover overlay on a gallery card: delete (every gallery) and, for live
// galleries, copy link / email share / duplicate. Every button has a Hebrew tooltip.
export function GalleryCardActions({ gallery: g, isLive, actions, onOpenEmailShare }: {
  gallery: Gallery
  isLive: boolean
  actions: GalleryActions
  onOpenEmailShare: (g: Gallery) => void
}) {
  const { copyGalleryLink, copiedGalleryId, duplicateGallery, duplicatingId, deleteGallery } = actions
  return (
    <>
      <div className={cn('absolute end-3 top-3', reveal)}>
        <button
          onClick={(e) => { e.stopPropagation(); void deleteGallery(g) }}
          title="מחיקת גלריה"
          aria-label="מחיקת גלריה"
          className={cn(actionButton, 'text-danger')}
        >
          <Icon name="trash" size={14} strokeWidth={1.85} />
        </button>
      </div>
      {isLive && (
        <div className={cn('absolute start-3 bottom-3 flex gap-1.5', reveal)}>
          <button
            onClick={(e) => copyGalleryLink(g.id, e)}
            title={copiedGalleryId === g.id ? 'הקישור הועתק' : 'העתקת קישור לגלריה'}
            aria-label={copiedGalleryId === g.id ? 'הקישור הועתק' : 'העתקת קישור לגלריה'}
            className={actionButton}
          >
            <Icon name={copiedGalleryId === g.id ? 'check' : 'link'} size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEmailShare(g) }}
            title="שליחה ללקוח במייל"
            aria-label="שליחה ללקוח במייל"
            className={actionButton}
          >
            <Icon name="mail" size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); duplicateGallery(g) }}
            disabled={duplicatingId === g.id}
            title="שכפול גלריה (עותק חדש)"
            aria-label="שכפול גלריה"
            className={cn(actionButton, duplicatingId === g.id && 'cursor-wait opacity-60')}
          >
            <Icon name="duplicate" size={14} strokeWidth={1.85} />
          </button>
        </div>
      )}
    </>
  )
}
