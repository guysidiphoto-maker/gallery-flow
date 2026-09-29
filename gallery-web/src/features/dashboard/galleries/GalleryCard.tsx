import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import { cardCoverUrl } from '../lib/cardCoverUrl'
import type { GalleryActions } from '../hooks/useGalleryActions'
import type { Gallery } from '../types'
import { GalleryCardActions } from './GalleryCardActions'

export function GalleryCard({ gallery: g, index: idx, fallbackCover, actions, onOpen, onOpenEmailShare }: {
  gallery: Gallery
  index: number
  fallbackCover: string | undefined
  actions: GalleryActions
  onOpen: (g: Gallery) => void
  onOpenEmailShare: (g: Gallery) => void
}) {
  const isLive = g.status === 'live'
  const explicitCover = ((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined) || null
  const cover = explicitCover || fallbackCover || null
  return (
    <div
      className="group animate-[dash-fade-up_.55s_cubic-bezier(.2,.7,.2,1)_both] cursor-pointer rounded-[4px] bg-surface transition-transform duration-350 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5"
      // Editorial reveal: 60ms cascade per tile.
      style={{ animationDelay: `${Math.min(idx, 12) * 0.06}s` }}
      onClick={() => onOpen(g)}
    >
      <div
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-hair transition-shadow duration-250 ease-[ease]',
          'shadow-[0_1px_2px_--alpha(var(--color-black)/4%),0_6px_18px_--alpha(var(--color-black)/4%)] group-hover:shadow-[0_1px_2px_--alpha(var(--color-black)/4%),0_12px_32px_--alpha(var(--color-black)/8%)]',
          cover ? 'bg-surface' : 'bg-linear-135 from-surface to-line',
        )}
      >
        {cover && (
          <img
            src={cardCoverUrl(cover)}
            alt=""
            loading="lazy"
            decoding="async"
            className="block size-full object-cover transition-transform duration-600 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.02]"
          />
        )}
        {!cover && (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <Icon name="photo" size={36} strokeWidth={1.2} />
          </div>
        )}
        <GalleryCardActions
          gallery={g}
          isLive={isLive}
          actions={actions}
          onOpenEmailShare={onOpenEmailShare}
        />
      </div>

      <div className="px-4 pt-4 pb-[18px]">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted">
          <span className={cn('size-1.5 rounded-full', isLive ? 'bg-sage' : 'bg-line')} />
          <span>{isLive ? 'פורסמה' : 'טיוטה'}</span>
          {g.published_at && (
            <>
              <span className="mx-0.5 text-line">·</span>
              <span>{new Date(g.published_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </>
          )}
        </div>
        <h3 className="mb-1.5 text-[19px] leading-[1.25] font-medium tracking-[-0.015em] text-ink">
          {g.name}
        </h3>
        <div className="flex items-center gap-2.5 text-[13px] leading-[1.4] text-ink-soft">
          <span>{(g.image_count ?? 0).toLocaleString('he-IL')} תמונות</span>
        </div>
        {isLive && ((g.download_count ?? 0) > 0 || (g.favorite_count ?? 0) > 0) && (
          <div className="mt-2 flex gap-3.5 text-xs text-muted">
            {(g.download_count ?? 0) > 0 && (
              <span className="flex items-center gap-[5px]">
                <Icon name="download" size={12} strokeWidth={1.85} />
                {(g.download_count ?? 0).toLocaleString('he-IL')}
              </span>
            )}
            {(g.favorite_count ?? 0) > 0 && (
              <span className="flex items-center gap-[5px]">
                <Icon name="heart" size={12} strokeWidth={1.85} />
                {(g.favorite_count ?? 0).toLocaleString('he-IL')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
