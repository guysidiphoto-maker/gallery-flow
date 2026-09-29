import { cn } from '@/shared/ui'
import { pill } from './pill'
import { FOUND_THUMBS } from './useSelfieDemo'

interface Props { selfieUrl: string | null; visibleThumbs: number; onReset: () => void }

export function SelfieFound({ selfieUrl, visibleThumbs, onReset }: Props) {
  return (
    <div className="max-w-[440px] text-center">
      {selfieUrl && (
        <img
          src={selfieUrl}
          alt=""
          className="mb-5 size-[130px] animate-[mk-selfie-success-ring_1.5s_ease-out] rounded-full border-[3px] border-(--mk-success) object-cover"
        />
      )}
      <h1 className="mb-2 text-[28px] font-extrabold">
        מצאנו אותך 🔥
      </h1>
      <p className="mb-7 text-[16px] text-white/60">
        47 תמונות נמצאו
      </p>

      {/* Placeholder thumbnails: each tile's shade is derived from its index. */}
      <div className="mb-9 grid-cols-3 gap-2.5 [display:grid]">
        {Array.from({ length: FOUND_THUMBS }).map((_, i) => {
          const shown = i < visibleThumbs
          return (
            <div
              key={i}
              className={cn(
                'aspect-square rounded-[12px] transition-[opacity,transform] duration-300',
                shown ? 'animate-[mk-selfie-scale-in_.35s_ease-out_forwards] opacity-100 [transform:scale(1)]' : 'opacity-0 [transform:scale(.7)]',
              )}
              style={{
                background: `linear-gradient(135deg, hsl(${230 + i * 15}, 40%, ${18 + i * 3}%), hsl(${240 + i * 15}, 35%, ${24 + i * 2}%))`,
              }}
            />
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <a href="/" className={pill(true)}>צפה בתמונות</a>
        <button onClick={onReset} className={pill(false)}>נסה שוב</button>
      </div>
    </div>
  )
}
