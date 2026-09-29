import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { useEditor, useOpenGallery } from './EditorContext'
import { GalleryMoreMenu } from './GalleryMoreMenu'
import { PublishButton } from './PublishButton'
import { headerAction } from './headerAction'


// Name + status on the start side; Preview / Copy Link / More / Publish on the end.
export function EditorHeader() {
  const { session, actions } = useEditor()
  const gallery = useOpenGallery()
  const { galleryImages, copiedInEditor, setEditingGallery, copyEditorLink } = session
  const isLiveStatus = gallery.status === 'live'

  return (
    <div className="dash-editor-header flex items-center justify-between border-b border-line bg-surface px-8 py-[18px]">
      <div className="flex items-center gap-3.5">
        <button
          onClick={() => setEditingGallery(null)}
          aria-label="סגירת העורך"
          title="סגירת העורך"
          className="flex size-9 cursor-pointer items-center justify-center rounded-hair text-ink-soft hover:bg-sunken hover:text-ink"
        >
          <Icon name="close" size={18} strokeWidth={1.85} />
        </button>
        <div>
          <h2 id="gallery-editor-heading" className="m-0 text-[20px] font-medium tracking-[-0.015em] text-ink">
            {gallery.name}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-muted">
            <span className={cn('size-1.5 rounded-full', isLiveStatus ? 'bg-sage' : 'bg-line')} />
            <span>{isLiveStatus ? 'פורסמה' : 'טיוטה'}</span>
            <span className="mx-0.5 text-line">·</span>
            <span>{galleryImages.length} תמונות</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <a
          href={actions.shareUrl(gallery)}
          target="_blank"
          rel="noopener"
          className={cn(headerAction, 'border-line bg-transparent text-ink no-underline hover:border-ink')}
        >
          <Icon name="eye" size={14} strokeWidth={1.85} />
          תצוגה מקדימה
        </a>
        {isLiveStatus && (
          <button
            onClick={() => copyEditorLink(actions.shareUrl(gallery), gallery.id)}
            aria-live="polite"
            className={cn(
              headerAction,
              'cursor-pointer transition-[background-color,border-color,color] duration-150',
              copiedInEditor ? 'border-go/45 bg-go/10 text-go-ink' : 'border-line bg-transparent text-ink',
            )}
          >
            <Icon name={copiedInEditor ? 'check' : 'link'} size={14} strokeWidth={1.85} />
            {copiedInEditor ? 'הקישור הועתק' : 'העתקת קישור'}
          </button>
        )}
        <GalleryMoreMenu />
        <PublishButton />
      </div>
    </div>
  )
}
