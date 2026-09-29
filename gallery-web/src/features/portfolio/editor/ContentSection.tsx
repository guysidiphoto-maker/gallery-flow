import { cn } from '@/shared/ui'
import type { PortfolioSettings } from '../portfolioSettings'
import type { EditorGallery } from './options'
import { EditorPanel } from './EditorPanel'
import { accentGlow } from './classes'
import { icons } from './icons'

function eventType(g: EditorGallery): string {
  const v = (g.delivery_settings || {})['eventType']
  return typeof v === 'string' ? v : ''
}

/** Show/hide galleries on the public page. */
export function ContentSection({ settings, galleries, covers, update }: {
  settings: PortfolioSettings
  galleries: EditorGallery[]
  covers: Map<string, string>
  update: (patch: Partial<PortfolioSettings>) => void
}) {
  const visibleCount = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id)).length

  const toggle = (id: string) => {
    update({
      hiddenGalleryIds: settings.hiddenGalleryIds.includes(id)
        ? settings.hiddenGalleryIds.filter(g => g !== id)
        : [...settings.hiddenGalleryIds, id],
    })
  }

  return (
    <div className="animate-[pe-fade-in_.3s_ease_both]">
      <EditorPanel title={`גלריות באתר (${visibleCount}/${galleries.length})`} icon={icons.layout}>
        <div className="flex max-h-[400px] flex-col gap-1 overflow-y-auto">
          {galleries.map(g => {
            const hidden = settings.hiddenGalleryIds.includes(g.id)
            const cov = covers.get(g.id)
            return (
              <div
                key={g.id}
                onClick={() => toggle(g.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-200 hover:bg-white/4',
                  hidden ? 'border-white/3 bg-white/1 opacity-40' : 'border-white/6 bg-white/[.025]',
                )}
              >
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-white transition-all duration-200',
                    hidden ? 'border-white/12' : cn('border-(color:--accent) bg-(color:--accent)', accentGlow.sm),
                  )}
                >
                  {!hidden && icons.checkMd}
                </div>
                {cov && (
                  <div className="h-7 w-10 shrink-0 overflow-hidden rounded-md border border-white/6">
                    <img src={cov} alt="" className="size-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">{g.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/60">{eventType(g) || 'אחר'} · {g.image_count} תמונות</div>
                </div>
              </div>
            )
          })}
        </div>
      </EditorPanel>
    </div>
  )
}
