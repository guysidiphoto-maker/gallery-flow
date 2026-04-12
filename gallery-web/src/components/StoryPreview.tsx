import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  photos: string[]
  style: 'clean' | 'dynamic' | 'vintage'
  duration: number
  lang: 'en' | 'he'
}

interface Slide {
  photos: string[]  // 1 photo = portrait/square, 3 = landscape collage
  layout: 'single' | 'triple'
}

const KB = {
  clean:   { from: 'scale(1)',    to: 'scale(1.1) translate(-2%,-1%)',  fade: '0.8s' },
  dynamic: { from: 'scale(1.05)', to: 'scale(1.2) translate(-3%,-2%)', fade: '0.25s' },
  vintage: { from: 'scale(1)',    to: 'scale(1.06) translate(1%,-1%)',  fade: '1.2s' },
}

export function StoryPreview({ photos, style, duration, lang }: Props) {
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [phase, setPhase] = useState<'in'|'zoom'>('in')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Build slides: detect landscape vs portrait, group landscapes in 3s
  useEffect(() => {
    let cancelled = false
    async function build() {
      const ratios: { url: string; landscape: boolean }[] = []
      for (const url of photos.slice(0, 15)) {
        const r = await getAspectRatio(url)
        ratios.push({ url, landscape: r > 1.2 })
      }
      if (cancelled) return

      const result: Slide[] = []
      let i = 0
      while (i < ratios.length) {
        if (ratios[i].landscape) {
          // Grab up to 3 landscape photos for a collage slide
          const batch = [ratios[i].url]
          if (i + 1 < ratios.length && ratios[i + 1].landscape) { batch.push(ratios[i + 1].url); i++ }
          if (i + 1 < ratios.length && ratios[i + 1].landscape && batch.length < 3) { batch.push(ratios[i + 1].url); i++ }
          result.push({ photos: batch, layout: batch.length >= 2 ? 'triple' : 'single' })
        } else {
          result.push({ photos: [ratios[i].url], layout: 'single' })
        }
        i++
      }
      setSlides(result)
      setCurrent(0)
    }
    build()
    return () => { cancelled = true }
  }, [photos])

  // Auto-advance
  const slideCount = slides.length || 1
  const perSlide = (duration / slideCount) * 1000

  useEffect(() => {
    if (!playing || slides.length === 0) return
    setPhase('in')
    const t1 = setTimeout(() => setPhase('zoom'), 50)
    timer.current = setTimeout(() => setCurrent(c => (c + 1) % slides.length), perSlide)
    return () => { clearTimeout(t1); clearTimeout(timer.current) }
  }, [current, playing, perSlide, slides.length])

  const kb = KB[style]
  const slide = slides[current]

  if (slides.length === 0) return null

  return (
    <div className="story-preview-wrap">
      <div className="story-preview-phone">
        <div className="story-preview-screen">
          {/* Content */}
          {slide.layout === 'single' ? (
            // Single photo — full cover
            <div className="sp-img-wrap" style={{
              transform: phase === 'zoom' ? kb.to : kb.from,
              transition: `transform ${perSlide/1000}s ease-out`,
            }}>
              <img key={`${current}-0`} src={slide.photos[0]} alt=""
                className="sp-img" style={{ opacity: phase === 'zoom' ? 1 : 0, transition: `opacity ${kb.fade} ease` }} />
            </div>
          ) : (
            // Triple layout — 3 landscape photos stacked vertically
            <div className="sp-triple" style={{
              transform: phase === 'zoom' ? 'scale(1.03) translateY(-1%)' : 'scale(1)',
              transition: `transform ${perSlide/1000}s ease-out`,
            }}>
              {slide.photos.map((url, i) => (
                <div key={`${current}-${i}`} className="sp-triple-cell">
                  <img src={url} alt="" style={{
                    opacity: phase === 'zoom' ? 1 : 0,
                    transition: `opacity ${kb.fade} ease`,
                    transitionDelay: `${i * 0.15}s`,
                  }} />
                </div>
              ))}
            </div>
          )}

          {/* Overlays */}
          {style === 'vintage' && <div className="sp-vintage" />}
          {style === 'dynamic' && <><div className="sp-lbox sp-lbox--t" /><div className="sp-lbox sp-lbox--b" /></>}

          {/* Progress dots */}
          <div className="sp-dots">
            {slides.map((_, i) => (
              <div key={i} className="sp-dot">
                <div className="sp-dot-fill" style={{
                  width: i < current ? '100%' : i === current ? '100%' : '0%',
                  transition: i === current ? `width ${perSlide/1000}s linear` : 'none',
                }} />
              </div>
            ))}
          </div>

          {/* Play/pause */}
          <button className="sp-playpause" onClick={() => setPlaying(p => !p)}>
            {playing ? '\u23F8' : '\u25B6'}
          </button>
          <div className="sp-counter">{current + 1}/{slides.length}</div>
        </div>
        <div className="sp-label">
          {style === 'clean' ? 'Clean' : style === 'dynamic' ? 'Dynamic' : 'Vintage'}
        </div>
      </div>
      <p className="sp-note">
        {lang === 'he' ? '\u05ea\u05e6\u05d5\u05d2\u05d4 \u05de\u05e7\u05d3\u05d9\u05de\u05d4 \u00b7 \u05d4\u05d5\u05e8\u05d3 \u05d0\u05ea \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05dc\u05d9\u05d9\u05e6\u05d5\u05d0 \u05d5\u05d9\u05d3\u05d0\u05d5 \u05d1\u05d0\u05d9\u05db\u05d5\u05ea \u05de\u05dc\u05d0\u05d4' : 'Preview \u00b7 Download the app for full quality video export'}
      </p>
    </div>
  )
}

function getAspectRatio(url: string): Promise<number> {
  return new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img.naturalWidth / img.naturalHeight)
    img.onerror = () => res(1)
    img.src = url
  })
}
