import { useEffect, useMemo, useRef, useState } from 'react'
import type { GalleryImage } from '@/shared/types'

// At most this many photos mount up front; more reveal as a sentinel nears view.
const BATCH_SIZE = 150

function computeColumns(layoutMode: string, w: number): number {
  if (layoutMode === '1-col') return 1
  if (w < 640) return 2
  if (layoutMode === '3-col') return 4
  return 3
}

export function useColumnCount(layoutMode: string): number {
  const initial = typeof window === 'undefined' ? 3 : computeColumns(layoutMode, window.innerWidth)
  const [cols, setCols] = useState(initial)
  useEffect(() => {
    const calc = () => setCols(computeColumns(layoutMode, window.innerWidth))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [layoutMode])
  return cols
}

/** Container width, so thumbnails are fetched at the exact column width. */
export function useContainerWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { containerRef, containerWidth }
}

/**
 * Progressive render instead of a virtualized list: a react-window viewport
 * steals document scrolling and clips mixed-aspect rows, so memory is bounded
 * by batching instead.
 */
export function useProgressiveImages(images: GalleryImage[]) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    setVisibleCount(prev => Math.min(Math.max(BATCH_SIZE, prev), images.length))
  }, [images.length])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (visibleCount >= images.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(c => Math.min(c + BATCH_SIZE, images.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, images.length])
  const visibleImages = useMemo(() => images.slice(0, visibleCount), [images, visibleCount])
  return { visibleImages, hasMore: visibleCount < images.length, sentinelRef }
}

/**
 * Height-balanced masonry: each image, in order, goes into the currently
 * shortest column by its real aspect ratio. Deterministic, so loading more
 * never reshuffles placed tiles; unknown sizes count as square.
 */
export function useBalancedColumns(visibleImages: GalleryImage[], cols: number) {
  return useMemo(() => {
    const result: Array<Array<{ img: GalleryImage; index: number }>> = Array.from({ length: cols }, () => [])
    const heights = new Array(cols).fill(0)
    for (let i = 0; i < visibleImages.length; i++) {
      const img = visibleImages[i]
      const ratio = img.width && img.height ? img.height / img.width : 1
      let c = 0
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c] - 1e-6) c = k
      result[c].push({ img, index: i })
      heights[c] += ratio
    }
    return result
  }, [visibleImages, cols])
}

/**
 * Warms/releases a tile's download File as it enters/leaves the viewport so a
 * single tap on its download icon can open the iOS share sheet.
 */
export function useTileWarmObserver(onWarmDownload?: (img: GalleryImage, warm: boolean) => void) {
  const warmObserverRef = useRef<IntersectionObserver | null>(null)
  const tileImgByEl = useRef<Map<Element, GalleryImage>>(new Map())
  const tileElById = useRef<Map<string, Element>>(new Map())
  useEffect(() => {
    if (!onWarmDownload) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const img = tileImgByEl.current.get(e.target)
          if (img) onWarmDownload(img, e.isIntersecting)
        }
      },
      { rootMargin: '100px 0px' },
    )
    warmObserverRef.current = obs
    tileImgByEl.current.forEach((_img, el) => obs.observe(el))
    return () => { obs.disconnect(); warmObserverRef.current = null }
  }, [onWarmDownload])

  // Per-tile ref callback; unregisters replaced elements so nothing stale stays observed.
  return (img: GalleryImage) => (el: HTMLDivElement | null) => {
    const prev = tileElById.current.get(img.id)
    if (prev && prev !== el) {
      warmObserverRef.current?.unobserve(prev)
      tileImgByEl.current.delete(prev)
      tileElById.current.delete(img.id)
    }
    if (el) {
      tileElById.current.set(img.id, el)
      tileImgByEl.current.set(el, img)
      warmObserverRef.current?.observe(el)
    }
  }
}
