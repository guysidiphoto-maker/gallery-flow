import { Icon } from '@/shared/ui/Icon'
import type { GalleryActions } from '../hooks/useGalleryActions'
import { cn } from '@/shared/ui'
import type { Gallery } from '../types'

const actionButton =
  'flex size-[34px] cursor-pointer items-center justify-center rounded-hair border border-ink/8 bg-white/96 text-ink ' +
  'shadow-[0_1px_3px] shadow-black/6 backdrop-blur-[8px]'

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
      <div className="absolute end-3 top-3">
        <button
          onClick={(e) => { e.stopPropagation(); void deleteGallery(g) }}
          title="מחק גלריה"
          aria-label="מחק גלריה"
          className={cn(actionButton, 'text-danger')}
        >
          <Icon name="trash" size={14} strokeWidth={1.85} />
        </button>
      </div>
      {isLive && (
        <div className="absolute start-3 bottom-3 flex gap-1.5">
          <button
            onClick={(e) => copyGalleryLink(g.id, e)}
            title="העתק קישור"
            aria-label={copiedGalleryId === g.id ? 'הקישור הועתק' : 'העתק קישור'}
            className={actionButton}
          >
            <Icon name={copiedGalleryId === g.id ? 'check' : 'copy'} size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEmailShare(g) }}
            title="שלח במייל ללקוח"
            aria-label="שלח במייל ללקוח"
            className={actionButton}
          >
            <Icon name="mail" size={14} strokeWidth={1.85} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); duplicateGallery(g) }}
            disabled={duplicatingId === g.id}
            title="שכפל גלריה"
            aria-label="שכפל גלריה"
            className={cn(actionButton, duplicatingId === g.id && 'cursor-wait opacity-60')}
          >
            <Icon name="duplicate" size={14} strokeWidth={1.85} />
          </button>
        </div>
      )}
    </>
  )
}
