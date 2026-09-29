import { cn } from '@/shared/ui'
import type { GalleryHit, SearchLocale } from '../searchLogic'
import { t } from '../strings'
import { MatchChips } from './MatchChips'
import { resultRow } from './resultRow'

export function GalleryRow({ hit, locale, onOpen }: {
  hit: GalleryHit
  locale: SearchLocale
  onOpen: (galleryId: string) => void
}) {
  const meta = [
    hit.client_name ?? t(locale, 'search.unassigned'),
    hit.event_date,
    hit.event_type,
    hit.event_location,
    hit.image_count !== null ? `${hit.image_count} ${t(locale, 'search.imagesCount')}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <button type="button" className={resultRow} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openGallery')}: ${hit.name}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{hit.name}</span>
          {(hit.status === 'live' || hit.status === 'draft') && (
            <span
              className={cn(
                'rounded-full border px-2 py-px text-[11px]',
                hit.status === 'live' ? 'border-sage text-sage' : 'border-line text-muted',
              )}
            >
              {t(locale, hit.status === 'live' ? 'search.status.live' : 'search.status.draft')}
            </span>
          )}
        </span>
        {meta && (
          <span className="mt-[3px] block truncate text-xs text-muted">
            {meta}
          </span>
        )}
      </span>
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}
