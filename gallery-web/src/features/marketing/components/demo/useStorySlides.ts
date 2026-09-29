import { useEffect, useRef, useState } from 'react'

export interface Slide {
  /** 1 photo = portrait/square, 2–3 = stacked landscape collage. */
  photos: string[]
  layout: 'single' | 'triple'
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

/** Groups consecutive landscape photos (up to 3) into collage slides. */
async function buildSlides(photos: string[]): Promise<Slide[]> {
  const ratios: { url: string; landscape: boolean }[] = []
  for (const url of photos.slice(0, 15)) ratios.push({ url, landscape: (await getAspectRatio(url)) > 1.2 })
  const result: Slide[] = []
  let i = 0
  while (i < ratios.length) {
    if (ratios[i].landscape) {
      const batch = [ratios[i].url]
      if (i + 1 < ratios.length && ratios[i + 1].landscape) { batch.push(ratios[i + 1].url); i++ }
      if (i + 1 < ratios.length && ratios[i + 1].landscape && batch.length < 3) { batch.push(ratios[i + 1].url); i++ }
      result.push({ photos: batch, layout: batch.length >= 2 ? 'triple' : 'single' })
    } else {
      result.push({ photos: [ratios[i].url], layout: 'single' })
    }
    i++
  }
  return result
}

/** Slides + auto-advancing playback; `phase` flips to 'zoom' right after each cut. */
export function useStorySlides(photos: string[], duration: number) {
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [phase, setPhase] = useState<'in' | 'zoom'>('in')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let cancelled = false
    buildSlides(photos).then(result => {
      if (cancelled) return
      setSlides(result)
      setCurrent(0)
    })
    return () => { cancelled = true }
  }, [photos])

  const perSlide = (duration / (slides.length || 1)) * 1000

  useEffect(() => {
    if (!playing || slides.length === 0) return
    setPhase('in')
    const t1 = setTimeout(() => setPhase('zoom'), 50)
    timer.current = setTimeout(() => setCurrent(c => (c + 1) % slides.length), perSlide)
    return () => { clearTimeout(t1); clearTimeout(timer.current) }
  }, [current, playing, perSlide, slides.length])

  return { slides, current, playing, phase, perSlide, togglePlay: () => setPlaying(p => !p) }
}
