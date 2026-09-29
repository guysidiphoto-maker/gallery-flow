import { cn } from '@/shared/ui'
import { THINKING_LINES } from './useSelfieDemo'

export function SelfieThinking({ selfieUrl, visibleLines }: { selfieUrl: string | null; visibleLines: number }) {
  return (
    <div className="text-center">
      {selfieUrl && (
        <img
          src={selfieUrl}
          alt=""
          className="mb-9 size-[160px] animate-[mk-selfie-pulse_2s_ease-in-out_infinite,mk-selfie-glow_2s_ease-in-out_infinite] rounded-full border-[3px] border-brand/35 object-cover"
        />
      )}
      <div className="flex min-h-[120px] flex-col items-center gap-2.5">
        {THINKING_LINES.map((line, i) => (
          <div
            key={i}
            dir="rtl"
            className={cn(
              'text-[15px] transition-[color] duration-300',
              i === visibleLines - 1 ? 'text-white/95' : 'text-white/35',
              i < visibleLines ? 'animate-[mk-selfie-slide-up_.4s_ease-out_forwards] opacity-100' : 'opacity-0',
            )}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
