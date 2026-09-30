import { displayUrl } from '@/shared/lib/supabase'
import { cn } from '@/shared/ui'
import type { ImageHit, SearchLocale } from '../searchLogic'
import { t } from '../strings'
import { MatchChips } from './MatchChips'
import { resultRow } from './resultRow'

const IMAGE_BUCKET = 'gallery-images'

export function ImageCard({ hit, locale, onOpen }: {
  hit: ImageHit
  locale: SearchLocale
  onOpen: (galleryId: string) => void
}) {
  // Same thumbnail pattern the rest of the app uses: displayUrl serves the
  // pre-baked derivative directly, or a bounded transform for original paths.
  const thumbUrl = hit.thumbnail_path
    ? displayUrl(IMAGE_BUCKET, hit.thumbnail_path, 320)
    : null

  return (
    <button type="button" onClick={() => onOpen(hit.gallery_id)}
      aria-label={`${t(locale, 'search.openGallery')}: ${hit.gallery_name ?? hit.filename}`}
      className={cn(resultRow, 'flex-col items-stretch gap-2 p-2.5')}>
      <span className="block aspect-[3/2] w-full overflow-hidden rounded-[3px] bg-surface">
        {thumbUrl && (
          <img src={thumbUrl} alt={hit.filename} loading="lazy"
            className="block size-full object-cover" />
        )}
      </span>
      <span className="truncate text-start text-xs text-ink [direction:ltr]">
        {hit.filename}
      </span>
      {hit.gallery_name && (
        <span className="truncate text-[11px] text-muted">
          {hit.gallery_name}
        </span>
      )}
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}
