import type { StoryStyle } from './useDemoState'
import { useStorySlides } from './useStorySlides'

interface Props {
  photos: string[]
  style: StoryStyle
  duration: number
  note: string
}

// Ken Burns start/end transforms and cross-fade speed per style.
const KB = {
  clean:   { from: 'scale(1)',    to: 'scale(1.1) translate(-2%,-1%)',  fade: '0.8s' },
  dynamic: { from: 'scale(1.05)', to: 'scale(1.2) translate(-3%,-2%)', fade: '0.25s' },
  vintage: { from: 'scale(1)',    to: 'scale(1.06) translate(1%,-1%)',  fade: '1.2s' },
}
const LABEL = { clean: 'Clean', dynamic: 'Dynamic', vintage: 'Vintage' }

/** Phone-sized, CSS-animated preview of the generated story. */
export function StoryPreview({ photos, style, duration, note }: Props) {
  const { slides, current, playing, phase, perSlide, togglePlay } = useStorySlides(photos, duration)
  if (slides.length === 0) return null

  const kb = KB[style]
  const slide = slides[current]
  const zoom = phase === 'zoom'
  const move = `transform ${perSlide / 1000}s ease-out`
  const fade = `opacity ${kb.fade} ease`

  return (
    <div className="py-3 text-center">
      <div className="inline-block w-[200px]">
        <div className="group relative h-[356px] w-[200px] overflow-hidden rounded-lg border-2 border-white/10 bg-black">
          {slide.layout === 'single' ? (
            <div className="absolute -inset-[10%] will-change-transform" style={{ transform: zoom ? kb.to : kb.from, transition: move }}>
              <img key={`${current}-0`} src={slide.photos[0]} alt="" className="h-full w-full object-cover" style={{ opacity: zoom ? 1 : 0, transition: fade }} />
            </div>
          ) : (
            <div
              className="absolute inset-0 flex flex-col gap-[3px] p-[3px] will-change-transform"
              style={{ transform: zoom ? 'scale(1.03) translateY(-1%)' : 'scale(1)', transition: move }}
            >
              {slide.photos.map((url, i) => (
                <div key={`${current}-${i}`} className="flex-1 overflow-hidden rounded-[4px]">
                  <img src={url} alt="" className="block h-full w-full object-cover" style={{ opacity: zoom ? 1 : 0, transition: fade, transitionDelay: `${i * 0.15}s` }} />
                </div>
              ))}
            </div>
          )}

          {style === 'vintage' && (
            <div className="pointer-events-none absolute inset-0 z-1 bg-(image:--mk-lp-vignette) after:absolute after:inset-0 after:bg-(--mk-lp-sepia)" />
          )}
          {style === 'dynamic' && (
            <>
              <div className="absolute inset-x-0 top-0 z-2 h-5 bg-black/85" />
              <div className="absolute inset-x-0 bottom-0 z-2 h-5 bg-black/85" />
            </>
          )}

          <div className="absolute inset-x-1.5 top-1.5 z-3 flex gap-0.5">
            {slides.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-[1px] bg-white/25">
                <div
                  className="h-full rounded-[1px] bg-white"
                  style={{ width: i <= current ? '100%' : '0%', transition: i === current ? `width ${perSlide / 1000}s linear` : 'none' }}
                />
              </div>
            ))}
          </div>

          <button
            className="absolute right-2.5 bottom-2.5 z-3 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 backdrop-blur-[4px] transition-opacity duration-200 ease-[ease] group-hover:opacity-100"
            onClick={togglePlay}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <div className="absolute bottom-3 left-2.5 z-3 text-[9px] text-white/45">{current + 1}/{slides.length}</div>
        </div>
        <div className="mt-2 text-[0.7rem] font-semibold tracking-[0.1em] text-white/45 uppercase">{LABEL[style]}</div>
      </div>
      <p className="mt-3 text-[0.65rem] text-white/25">{note}</p>
    </div>
  )
}
