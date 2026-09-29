import { Icon } from '@/shared/ui/Icon'
import { Button, WorkspaceView, workspaceAction } from '@/shared/ui'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { GalleryEditor } from '../editor/GalleryEditor'
import type { GalleryActions } from '../hooks/useGalleryActions'
import type { Gallery } from '../types'
import { GalleryStats } from './GalleryStats'
import { GalleriesSkeleton } from './GalleriesSkeleton'
import { GalleriesEmptyState } from './GalleriesEmptyState'
import { GalleryCard } from './GalleryCard'
import { DownloadTrackingTeaser } from './DownloadTrackingTeaser'

// The "my galleries" workspace: heading, stats, grid, and the editor overlay.
export function GalleriesView({
  galleries, loadingGalleries, coverFallback, actions, onOpenGallery, onOpenEmailShare, onNewGallery, editorOpen,
}: {
  galleries: Gallery[]
  loadingGalleries: boolean
  coverFallback: Record<string, string>
  actions: GalleryActions
  onOpenGallery: (g: Gallery) => void
  onOpenEmailShare: (g: Gallery) => void
  onNewGallery: () => void
  editorOpen: boolean
}) {
  const { t } = useOwnerLocale()
  return (
    <>
      <WorkspaceView
        eyebrow={t('nav.workspace')}
        title={t('nav.galleries')}
        actions={
          <Button variant="secondary" onClick={onNewGallery} className={workspaceAction}>
            <Icon name="plus" size={13} strokeWidth={2} />
            {t('galleries.new')}
          </Button>
        }
      >
        {!loadingGalleries && galleries.length > 0 && <GalleryStats galleries={galleries} />}

        {loadingGalleries ? (
          <GalleriesSkeleton />
        ) : galleries.length === 0 ? (
          <GalleriesEmptyState onNewGallery={onNewGallery} />
        ) : (
          <div className="dash-gallery-grid grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {galleries.map((g, idx) => (
              <GalleryCard
                key={g.id}
                gallery={g}
                index={idx}
                fallbackCover={coverFallback[g.id]}
                actions={actions}
                onOpen={onOpenGallery}
                onOpenEmailShare={onOpenEmailShare}
              />
            ))}
          </div>
        )}

        {galleries.length > 0 && <DownloadTrackingTeaser />}
      </WorkspaceView>
      {/* Outside the animated view so the fixed dialog is never trapped by a transform. */}
      {editorOpen && <GalleryEditor />}
    </>
  )
}
