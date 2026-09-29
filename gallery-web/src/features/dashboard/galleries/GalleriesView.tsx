import { Icon } from '@/shared/ui/Icon'
import { GalleryEditor } from '../editor/GalleryEditor'
import type { GalleryActions } from '../hooks/useGalleryActions'
import { textMuted, textPrimary } from '../styles'
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
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 36, animation: 'fadeInUp .4s ease both',
        gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 14,
          }}>
            Workspace
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 56px)',
            fontWeight: 500, margin: 0,
            letterSpacing: '-0.025em', lineHeight: 1.02, color: textPrimary,
          }}>
            הגלריות שלי
          </h1>
        </div>
        <button
          onClick={onNewGallery}
          style={{
            background: 'transparent',
            color: textPrimary,
            border: `1px solid ${textPrimary}`,
            borderRadius: 2,
            padding: '13px 26px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background .2s, color .2s',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
        >
          New Gallery
          <Icon name="plus" size={13} strokeWidth={2} />
        </button>
      </div>

      {!loadingGalleries && galleries.length > 0 && <GalleryStats galleries={galleries} />}

      {loadingGalleries ? (
        <GalleriesSkeleton />
      ) : galleries.length === 0 ? (
        <GalleriesEmptyState onNewGallery={onNewGallery} />
      ) : (
        <div className="dash-gallery-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 32,
        }}>
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
