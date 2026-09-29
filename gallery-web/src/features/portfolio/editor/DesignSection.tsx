import type { CSSProperties } from 'react'
import { cn } from '@/shared/ui'
import type { PortfolioSettings } from '../portfolioSettings'
import { ACCENT_COLORS, BG_STYLES, FONT_STYLES, HERO_STYLES, type EditorGallery } from './options'
import { EditorPanel } from './EditorPanel'
import { accentGlow, optionClass } from './classes'
import { icons, SwatchCheck } from './icons'

const HEBREW_FONTS = ['heebo', 'rubik', 'assistant']

export function DesignSection({ settings, galleries, covers, update }: {
  settings: PortfolioSettings
  galleries: EditorGallery[]
  covers: Map<string, string>
  update: (patch: Partial<PortfolioSettings>) => void
}) {
  return (
    <div className="flex animate-[pe-fade-in_.3s_ease_both] flex-col gap-4">
      <EditorPanel title="צבע מבטא" icon={icons.drop}>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map(c => {
            const on = settings.accentColor === c
            return (
              <button
                key={c}
                onClick={() => update({ accentColor: c })}
                // Each swatch glows in its own color, not the current accent.
                style={{ background: c, '--sw': c } as CSSProperties}
                className={cn(
                  'relative size-9 cursor-pointer rounded-[10px] outline-none transition-all duration-200 hover:scale-112',
                  on
                    ? 'border-[2.5px] border-white shadow-[0_0_20px_color-mix(in_srgb,var(--sw)_25%,transparent),0_0_0_4px_color-mix(in_srgb,var(--sw)_8%,transparent)]'
                    : 'border-[1.5px] border-white/12 shadow-[inset_0_-2px_4px_rgb(0_0_0/0.2)]',
                )}
              >
                {on && (
                  <SwatchCheck className={cn('absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2', c === '#ffffff' ? 'text-black' : 'text-white')} />
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-black/20 px-3 py-2">
          <div className="size-4 rounded border border-white/10 bg-(color:--accent)" />
          <span className="font-mono text-[11px] text-white/60">{settings.accentColor}</span>
        </div>
      </EditorPanel>

      <EditorPanel title="סגנון רקע" icon={icons.square}>
        <div className="grid grid-cols-4 gap-2">
          {BG_STYLES.map(bg => {
            const on = settings.bgStyle === bg.key
            return (
              <button
                key={bg.key}
                onClick={() => update({ bgStyle: bg.key })}
                style={{ background: bg.bg }}
                className={cn(
                  'relative cursor-pointer overflow-hidden rounded-xl px-2 pt-5 pb-3 text-center text-[11px] font-semibold transition-all duration-200',
                  on ? cn('border-2 border-(color:--accent) text-white', accentGlow.lg) : 'border-[1.5px] border-white/6 text-white/40',
                )}
              >
                {on && (
                  <div className="absolute start-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-(color:--accent) text-white">
                    {icons.checkSm}
                  </div>
                )}
                {bg.label}
              </button>
            )
          })}
        </div>
      </EditorPanel>

      <EditorPanel title="סגנון גופן" icon={icons.type}>
        <div className="grid grid-cols-3 gap-2">
          {FONT_STYLES.map(f => (
            <button
              key={f.key}
              onClick={() => update({ fontStyle: f.key })}
              style={{ fontFamily: f.family }}
              className={cn(optionClass(settings.fontStyle === f.key), 'px-2 pt-3.5 pb-2.5 text-center text-[11px]')}
            >
              <div className="mb-1 text-[22px] leading-[1.2] font-bold">{f.sample}</div>
              <div className="mb-1 text-[9px] font-normal text-white/45">
                {HEBREW_FONTS.includes(f.key) ? 'שלום עולם' : 'Hello World'}
              </div>
              {f.label}
            </button>
          ))}
        </div>
      </EditorPanel>

      <EditorPanel title="סגנון Hero" icon={icons.film}>
        <div className="flex gap-2">
          {HERO_STYLES.map(h => (
            <button
              key={h.key}
              onClick={() => update({ heroStyle: h.key })}
              className={cn(optionClass(settings.heroStyle === h.key), 'flex-1 px-2 py-3 text-[11px]')}
            >
              {h.label}
            </button>
          ))}
        </div>
        {settings.heroStyle !== 'gradient-only' && (
          <div className="mt-3">
            <div className="mb-2 text-[11px] font-medium text-white/60">תמונת רקע</div>
            <div className="flex flex-wrap gap-1.5">
              {galleries.map(g => {
                const cov = covers.get(g.id)
                if (!cov) return null
                const on = settings.heroCoverGalleryId === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => update({ heroCoverGalleryId: g.id })}
                    className={cn(
                      'h-[42px] w-[60px] cursor-pointer overflow-hidden rounded-lg bg-white/3 p-0 transition-all duration-150',
                      on ? cn('border-2 border-(color:--accent) opacity-100', accentGlow.md) : 'border-[1.5px] border-white/8 opacity-70',
                    )}
                  >
                    <img src={cov} alt="" className="size-full object-cover" />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </EditorPanel>

      <EditorPanel title="עמודות בגריד" icon={icons.grid}>
        <div className="flex gap-2.5">
          {([2, 3] as const).map(n => {
            const on = settings.gridColumns === n
            return (
              <button
                key={n}
                onClick={() => update({ gridColumns: n })}
                className={cn(optionClass(on), 'flex-1 px-2.5 py-3.5 text-center text-xs')}
              >
                <div className={cn('mb-2 grid gap-[3px] px-2', n === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                  {Array.from({ length: n * 2 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn('aspect-[4/3] rounded-[3px] transition-[background] duration-200', on ? 'bg-(color:--accent)/[19%]' : 'bg-white/6')}
                    />
                  ))}
                </div>
                {n} עמודות
              </button>
            )
          })}
        </div>
      </EditorPanel>
    </div>
  )
}
