import { cn } from '@/shared/ui'
import { THINKING_LINES_MAP, dirClass, type FaceSearchLang } from '../faceSearchTexts'

interface Props {
  lang: FaceSearchLang
  selfieUrl: string | null
  visibleLines: number
}

export function ThinkingStep({ lang, selfieUrl, visibleLines }: Props) {
  return (
    <div className="animate-[fse-fadeIn_.4s_ease_both]">
      {selfieUrl && (
        <div className="relative mx-auto mb-9 flex size-[150px] items-center justify-center">
          <div className="absolute -inset-[18px] animate-[fse-orbit_2s_linear_infinite] rounded-full border-[1.5px] border-transparent border-t-brand/40 border-r-brand/15" />
          <div className="absolute -inset-2.5 animate-[fse-orbit-reverse_3s_linear_infinite] rounded-full border border-transparent border-b-brand-violet/30 border-l-brand-violet/10" />
          <div className="pointer-events-none absolute -inset-[25px] animate-[fse-glow_2.5s_ease-in-out_infinite] rounded-full bg-radial/srgb from-brand/12 to-transparent to-70%" />
          <div className="relative size-[140px] animate-[fse-pulse_3s_ease-in-out_infinite] overflow-hidden rounded-full border-3 border-brand/35">
            <img src={selfieUrl} alt="" className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-x-0 h-0.5 animate-[fse-scanline_2s_ease-in-out_infinite] bg-linear-to-r/srgb from-transparent via-brand/50 to-transparent" />
          </div>
        </div>
      )}

      <div className="mb-6 flex justify-center gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="size-1.5 animate-[fse-dotPulse_1.4s_ease-in-out_infinite] rounded-full bg-brand/60"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>

      <div className={cn('flex min-h-[110px] flex-col items-center gap-2.5', dirClass(lang))}>
        {THINKING_LINES_MAP[lang].map((line, i) => {
          const current = i === visibleLines - 1
          const shown = i < visibleLines
          return (
            <p
              key={i}
              className={cn(
                'text-[15px] leading-[1.7] tracking-[.01em] transition-all duration-600 ease-[cubic-bezier(.16,1,.3,1)]',
                current ? 'font-semibold text-white/75' : 'font-normal text-white/25',
                shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              )}
            >
              {line}
            </p>
          )
        })}
      </div>
    </div>
  )
}
