import { cn } from '@/shared/ui'
import { getFontFamily, type PortfolioSettings } from '../portfolioSettings'
import { BG_STYLES, type EditorGallery } from './options'
import { icons } from './icons'

type PreviewMode = 'mobile' | 'desktop'

/** Sticky miniature of the public portfolio page, re-rendered on every settings change. */
export function PreviewPane({ settings, clientName, galleries, covers, mode, onModeChange }: {
  settings: PortfolioSettings
  clientName: string
  galleries: EditorGallery[]
  covers: Map<string, string>
  mode: PreviewMode
  onModeChange: (m: PreviewMode) => void
}) {
  const heroCoverUrl = settings.heroCoverGalleryId ? covers.get(settings.heroCoverGalleryId) : covers.values().next().value
  const shown = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id)).slice(0, 4)
  const desktop = mode === 'desktop'

  return (
    <div className={cn('sticky top-5 shrink-0 transition-[width] duration-400', desktop ? 'w-[480px]' : 'w-80')}>
      <div className="mb-3 flex w-fit gap-0.5 rounded-[10px] border border-white/5 bg-black/40 p-[3px]">
        {(['mobile', 'desktop'] as const).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={cn(
              'flex items-center gap-[5px] rounded-[7px] px-4 py-1.5 text-[11px] font-semibold transition-all duration-200',
              mode === m ? 'bg-(color:--accent)/[12.5%] text-white' : 'text-white/35',
            )}
          >
            {m === 'mobile' ? icons.mobile : icons.desktop}
            {m === 'mobile' ? 'מובייל' : 'דסקטופ'}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'overflow-hidden border-white/6 shadow-[0_16px_48px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.03)] transition-all duration-400',
          desktop ? 'rounded-[14px] border' : 'rounded-[28px] border-6',
        )}
      >
        <div
          className={cn('flex flex-col overflow-hidden transition-[aspect-ratio,background] duration-400', desktop ? 'aspect-[16/10]' : 'aspect-[9/16]')}
          style={{
            background: BG_STYLES.find(b => b.key === settings.bgStyle)?.bg || BG_STYLES[0].bg,
            fontFamily: getFontFamily(settings.fontStyle),
          }}
        >
          <div className="relative flex flex-[0_0_35%] flex-col items-center justify-center overflow-hidden">
            {heroCoverUrl && settings.heroStyle !== 'gradient-only' && (
              <img
                src={heroCoverUrl}
                alt=""
                className={cn('absolute inset-0 size-full scale-110 object-cover', settings.heroStyle === 'blur' ? 'blur-[12px] brightness-40' : 'brightness-50')}
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse,color-mix(in_srgb,var(--accent)_12.5%,transparent),transparent_70%)]" />
            <div className="relative p-3 text-center">
              {settings.logoBase64 && <img src={settings.logoBase64} alt="" className="mx-auto mb-1.5 block max-h-7 max-w-20" />}
              <div className="text-base font-extrabold tracking-[-0.02em] text-white">{settings.pageTitle || clientName}</div>
              {settings.tagline && <div className="mt-0.5 text-[8px] text-white/50">{settings.tagline}</div>}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-hidden p-2">
            <div className="mb-0.5 text-[8px] font-bold text-white/40">סוגי אירועים</div>
            <div className={cn('grid flex-1 gap-1', settings.gridColumns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {shown.map(g => {
                const cov = covers.get(g.id)
                return (
                  <div key={g.id} className="relative overflow-hidden rounded-md border border-(color:--accent)/[12.5%] bg-white/3">
                    {cov && <img src={cov} alt="" className="size-full object-cover" />}
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.7),transparent)] p-1">
                      <div className="text-[7px] font-bold text-white">{g.name}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {(settings.phone || settings.email || settings.instagram) && (
            <div className="flex justify-center gap-2 border-t border-(color:--accent)/[8%] px-2 py-1.5 text-[6px] text-white/30">
              {settings.phone && <span>{settings.phone}</span>}
              {settings.email && <span>{settings.email}</span>}
              {settings.instagram && <span>@{settings.instagram}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
