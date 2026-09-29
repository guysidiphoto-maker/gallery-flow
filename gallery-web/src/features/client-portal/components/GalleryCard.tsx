import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import { focusRing } from '../lib/focusRing'
import { PortalCover } from './PortalCover'

export interface GalleryCardData {
  id: string
  name: string
  coverUrl: string | null
  imageCount: number
  publishedIso: string | null
}

interface Props {
  data: GalleryCardData
  href: string
  statusLabel: string
  dateLabel: string
  countLabel: string
  openLabel: string
}

export function GalleryCard({ data, href, statusLabel, dateLabel, countLabel, openLabel }: Props) {
  return (
    <a
      href={href}
      aria-label={`${openLabel} — ${data.name}`}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-[4px] border border-line-soft bg-white text-ink no-underline',
        'transition-[border-color,transform,box-shadow] duration-150',
        'hover:-translate-y-0.5 hover:border-ink hover:shadow-card focus:-translate-y-0.5 focus:border-ink focus:shadow-card',
        focusRing,
      )}
    >
      <div className="relative">
        <PortalCover coverUrl={data.coverUrl} name={data.name} />
        <div className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-white/92 px-2.5 py-1 text-[10px] font-medium tracking-[0.12em] text-ink-soft uppercase">
          <span className="size-1.5 rounded-full bg-sage" />
          {statusLabel}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-serif text-lg leading-[1.25] font-medium tracking-[-0.01em] text-ink">
          {data.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {dateLabel && <span>{dateLabel}</span>}
          {dateLabel && <span aria-hidden className="opacity-50">·</span>}
          <span>{countLabel}</span>
        </div>
        <div className="mt-auto inline-flex items-center gap-2 pt-3.5 text-[11px] font-medium tracking-[0.16em] text-ink-soft uppercase group-hover:text-ink group-focus:text-ink">
          {openLabel}
          <Icon name="arrow-out" size={13} strokeWidth={1.85} />
        </div>
      </div>
    </a>
  )
}
