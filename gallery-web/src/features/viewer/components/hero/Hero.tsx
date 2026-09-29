import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'

/**
 * Page header over the cover (or a blurred, dimmed fallback photo) so the page
 * never opens as a flat black block. Hidden in mobile feed mode.
 */
export function Hero({ bgUrl, hasCustomCover, hidden, children }: {
  bgUrl: string | null
  hasCustomCover: boolean
  hidden: boolean
  children: ReactNode
}) {
  return (
    <header
      className={cn(
        'relative flex max-h-[46vh] min-h-[clamp(220px,34vh,340px)] flex-col items-center justify-center overflow-hidden text-center',
        'px-(--viewer-content-px) pt-[clamp(32px,4vw,48px)] pb-[clamp(18px,2vw,28px)]',
        'max-[641px]:max-h-[36vh] max-[641px]:min-h-[clamp(160px,28vh,240px)]',
        !bgUrl && 'gv-hero-glow',
        hidden && 'hidden',
      )}
    >
      {bgUrl && (
        <div
          className={cn(
            'absolute inset-[-8%] z-0 bg-cover bg-center [transform:scale(1.08)]',
            'animate-[gv-hero-bg-in_1.2s_ease_both] motion-reduce:animate-none',
            hasCustomCover ? 'brightness-[.82] saturate-[1.05]' : '[filter:blur(25px)_saturate(120%)_brightness(0.65)]',
          )}
          style={{ backgroundImage: `url(${bgUrl})` }}
          aria-hidden="true"
        />
      )}
      {bgUrl && <div className="gv-hero-overlay absolute inset-0 z-0" />}
      <div className="relative z-1 mx-auto flex max-w-[760px] animate-[gv-hero-content-in_.8s_cubic-bezier(.16,1,.3,1)_.15s_both] flex-col items-center motion-reduce:animate-none">
        {children}
      </div>
    </header>
  )
}
