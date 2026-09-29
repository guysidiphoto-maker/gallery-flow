import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { useEditor, useOpenGallery } from './EditorContext'
import { GalleryMoreMenu } from './GalleryMoreMenu'
import { PublishButton } from './PublishButton'

const headerAction =
  'inline-flex items-center gap-2 rounded-hair border px-[18px] py-2.5 text-[11px] font-medium tracking-label uppercase'

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
          aria-label="חזרה"
          className="flex cursor-pointer items-center p-1 text-ink-soft"
        >
          <Icon name="close" size={18} strokeWidth={1.85} />
        </button>
        <div>
          <h2 id="gallery-editor-heading" className="m-0 text-[20px] font-medium tracking-[-0.015em] text-ink">
            {gallery.name}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-medium tracking-label text-muted uppercase">
            <span className={cn('size-1.5 rounded-full', isLiveStatus ? 'bg-sage' : 'bg-line')} />
            <span>{isLiveStatus ? 'Published' : 'Draft'}</span>
            <span className="mx-0.5 text-line">·</span>
            <span>{galleryImages.length} תמונות</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <a
          href={actions.shareUrl(gallery)}
          target="_blank"
          className={cn(headerAction, 'border-line bg-transparent text-ink no-underline')}
        >
          <Icon name="arrow-out" size={13} strokeWidth={1.85} />
          Preview
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
