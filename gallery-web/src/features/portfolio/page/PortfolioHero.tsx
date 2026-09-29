import { cn } from '@/shared/ui'
import { viewportHeight } from './lib'

/**
 * 200vh scroll stage with a sticky frame: the studio name fades out, then the
 * "Step into the experience" prompt fades in, over a darkening mosaic.
 */
export function PortfolioHero({ scrollY, tiles, logo, title, tagline }: {
  scrollY: number
  tiles: string[]
  logo: string
  title: string
  tagline: string
}) {
  const vh = viewportHeight()
  const showName = scrollY < vh * 0.3
  const showQuestion = scrollY >= vh * 0.5 && scrollY < vh * 0.9
  const heroDarken = Math.min(.92, .15 + scrollY / (vh * 0.5))
  const heroImgY = scrollY * 0.3

  return (
    <section className="relative h-[200vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {tiles.length > 0 && (
          <div
            className="absolute -inset-2.5 grid grid-cols-6 grid-rows-5 gap-[3px] will-change-transform"
            style={{ transform: `translateY(${-heroImgY * 0.5}px)` }}
          >
            {tiles.map((url, i) => (
              <div key={i} className="relative overflow-hidden bg-night">
                {/* Keyed by url so a swapped tile remounts and replays its fade. */}
                <img key={url + '-' + i} src={url} alt="" className="absolute inset-0 block size-full animate-[pp-tile-fade_2s_ease_both] object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${heroDarken})` }} />

        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center transition-[opacity,translate] duration-600 ease-out-expo will-change-[opacity,transform]',
            showName ? 'opacity-100' : 'translate-y-5 opacity-0',
          )}
        >
          {logo && <img src={logo} alt="" className="mb-5 block max-h-[70px] max-w-[240px]" />}
          <h1 className="text-[clamp(32px,6vw,80px)] leading-[1.1] font-normal tracking-[.04em]">{title}</h1>
          {tagline && (
            <p className="mt-3.5 text-[clamp(12px,1.4vw,16px)] font-normal tracking-[.15em] text-white/50 uppercase">{tagline}</p>
          )}
        </div>

        {/* The entrance animation's fill owns opacity/transform once it runs (kept as before). */}
        <div
          className={cn(
            'pp-scroll-hint pointer-events-none absolute bottom-9 left-1/2 flex [transform:translateX(-50%)] flex-col items-center gap-1.5 transition-opacity duration-500',
            showName ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="text-[9px] tracking-[.3em] text-white/30 uppercase">Scroll</div>
          <div className="animate-[pp-scroll-bounce_2s_ease_infinite]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center transition-[opacity,translate] duration-600 ease-out-expo',
            showQuestion ? 'translate-y-0 opacity-100' : 'translate-y-[30px] opacity-0',
          )}
        >
          <div className="mb-7 h-px w-[30px] bg-white/20" />
          <div className="max-w-[700px] text-center text-[clamp(26px,5vw,64px)] leading-[1.15] font-normal tracking-[.01em] text-white">
            Step into the
            <br />
            <span className="tracking-[.04em] italic">experience</span>
          </div>
          <div className="mt-[22px] text-[clamp(9px,1.1vw,13px)] tracking-[.3em] text-white/30 uppercase">Choose your event</div>
        </div>
      </div>
    </section>
  )
}
