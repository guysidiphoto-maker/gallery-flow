import { Icon } from '@/shared/ui/Icon'
import { Button, Eyebrow } from '@/shared/ui'
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
  return (
    <>
      <div className="mb-9 flex animate-[dash-fade-up_.4s_ease_both] flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow className="mb-3.5 block font-medium">Workspace</Eyebrow>
          <h1 className="text-[clamp(28px,4vw,56px)] leading-[1.02] font-medium tracking-[-0.025em] text-ink">
            הגלריות שלי
          </h1>
        </div>
        <Button variant="secondary" size="lg" onClick={onNewGallery} className="gap-2.5 px-[26px] py-[13px] duration-200">
          New Gallery
          <Icon name="plus" size={13} strokeWidth={2} />
        </Button>
      </div>

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

      {editorOpen && <GalleryEditor />}

      {galleries.length > 0 && <DownloadTrackingTeaser />}
    </>
  )
}
