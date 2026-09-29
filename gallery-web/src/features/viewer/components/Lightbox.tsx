import { useEffect, useCallback, useState } from 'react'
import type { GalleryImage } from '@/shared/types'
import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import { signedStorageUrl } from '@/shared/lib/signedStorage'
import { displayUrl } from '@/shared/lib/supabase'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { shouldRenderFullImage, shouldShowUnavailable, isRealLoadError } from '../lib/mobileViewer'

// Transformable buckets load a bounded ~2048px render instead of the stored
// object, which may be the multi-MB original (only fetched on download).
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])
const FULLSCREEN_WIDTH = 2048
const LQIP_WIDTH = 48

interface ViewerProps {
  images: GalleryImage[]
  index: number
  imgBucket: string
  allowDownloads: boolean
  downloadLabel: string
  onClose: () => void
  onNavigate: (index: number) => void
  /** The parent resolves the right download URL for the image. */
  onDownload: (img: GalleryImage) => void
}

// Hairline controls on the dark overlay, same editorial language as the rest of the app.
const control =
  'flex items-center justify-center border border-white/18 bg-white/6 text-white backdrop-blur-[8px] ' +
  '[transition:background-color_.15s,border-color_.15s]'
const focusRing = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/85'
const imgBase = 'max-h-[85vh] max-w-[92vw] rounded-[3px] object-contain select-none animate-[gv-lightbox-img-in_.3s_cubic-bezier(.16,1,.3,1)]'

export function Viewer({ images, index, imgBucket, allowDownloads, downloadLabel, onClose, onNavigate, onDownload }: ViewerProps) {
  const img = images[index]
  const total = images.length
  const [currentSrc, setCurrentSrc] = useState<string>('')
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [thumbSrc, setThumbSrc] = useState<string>('')

  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose)

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  useEffect(() => {
    let cancelled = false
    setLoadedSrc(null)
    setCurrentSrc('')
    setThumbSrc('')
    setLoadError(false)
    if (!img?.storage_path) return
    if (TRANSFORMABLE_BUCKETS.has(imgBucket)) {
      setThumbSrc(displayUrl(imgBucket, img.thumbnail_path ?? img.storage_path, LQIP_WIDTH, 40))
      setCurrentSrc(displayUrl(imgBucket, img.storage_path, FULLSCREEN_WIDTH, 78))
      return () => { cancelled = true }
    }
    // Non-transformable bucket: signed raw object.
    if (img.thumbnail_path) {
      signedStorageUrl(imgBucket, img.thumbnail_path)
        .then(url => { if (!cancelled) setThumbSrc(url) })
        .catch(() => { /* placeholder is optional */ })
    }
    signedStorageUrl(imgBucket, img.storage_path)
      .then(url => { if (!cancelled) setCurrentSrc(url) })
      .catch(() => { /* fallback handled inside signedStorageUrl */ })
    return () => { cancelled = true }
  }, [imgBucket, img?.storage_path, img?.thumbnail_path])

  // Preload the next 5 photos.
  useEffect(() => {
    if (total <= 1) return
    const count = Math.min(5, total - 1)
    for (let i = 1; i <= count; i++) {
      const nextImg = images[(index + i) % total]
      if (!nextImg?.storage_path) continue
      if (TRANSFORMABLE_BUCKETS.has(imgBucket)) {
        const im = new Image()
        im.src = displayUrl(imgBucket, nextImg.storage_path, FULLSCREEN_WIDTH, 78)
        continue
      }
      signedStorageUrl(imgBucket, nextImg.storage_path)
        .then(url => { const im = new Image(); im.src = url })
        .catch(() => { /* ignore preload failure */ })
    }
  }, [index, total, images, imgBucket])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      // In RTL the visual "previous" is on the right.
      const isRtl = document.documentElement.dir === 'rtl'
      if (e.key === 'ArrowLeft') isRtl ? next() : prev()
      if (e.key === 'ArrowRight') isRtl ? prev() : next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  useEffect(() => {
    let startX = 0
    function onTouchStart(e: TouchEvent) { startX = e.touches[0].clientX }
    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [prev, next])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[1000] flex animate-[gv-fade-in_.2s_ease] items-center justify-center bg-ink/92"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${images.length}`}
    >
      <div className="relative flex size-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* Physically top-right in both directions, by convention. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className={cn(control, focusRing, 'absolute top-4 right-4 z-10 size-[38px] rounded-hair hover:scale-105 hover:border-white/45')}
        >
          <Icon name="close" size={16} strokeWidth={1.85} />
        </button>

        <button
          onClick={prev}
          aria-label="Previous"
          className={cn(control, focusRing, 'absolute top-1/2 left-3.5 z-10 size-[42px] -translate-y-1/2 rounded-hair hover:border-white/45')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Blurred thumbnail LQIP, usually cached from the grid, until the full image loads. */}
        {thumbSrc && loadedSrc !== currentSrc && (
          <img
            key={`thumb-${thumbSrc}`}
            className={cn(imgBase, 'absolute blur-[14px] [transform:scale(1.04)]')}
            src={thumbSrc}
            alt=""
            aria-hidden="true"
          />
        )}

        {/* Never mount an <img> with an empty src: it resolves to the page URL and fires onError. */}
        {shouldRenderFullImage(currentSrc) && (
          <img
            key={currentSrc}
            className={cn(
              imgBase,
              'relative transition-opacity duration-250 ease-[ease]',
              loadedSrc === currentSrc ? 'opacity-100' : 'opacity-0',
              loadError && 'hidden',
            )}
            src={currentSrc}
            alt=""
            decoding="async"
            // @ts-expect-error fetchpriority is valid HTML but not yet in the React 18 DOM types
            fetchpriority="high"
            onLoad={() => setLoadedSrc(currentSrc)}
            // Only the active source may trip the error state, not a late error from the previous image.
            onError={(e) => { if (isRealLoadError(e.currentTarget.getAttribute('src'), currentSrc)) setLoadError(true) }}
          />
        )}

        {shouldShowUnavailable(loadError, currentSrc) && (
          <div
            role="status"
            className="absolute top-1/2 left-1/2 z-6 max-w-[360px] -translate-1/2 p-6 text-center text-[14px] leading-[1.6] text-white/85"
          >
            <p className="mb-3.5 font-semibold">
              {document.documentElement.dir === 'rtl' ? 'התמונה לא זמינה' : 'Image unavailable'}
            </p>
            {total > 1 && (
              <button onClick={next} className={cn(control, 'rounded-hair px-[18px] py-2.5 text-[12px] tracking-[.16em] uppercase')}>
                {document.documentElement.dir === 'rtl' ? 'לתמונה הבאה' : 'Next photo'}
              </button>
            )}
          </div>
        )}

        {loadedSrc !== currentSrc && !loadError && (
          <div
            aria-label="Loading"
            className="pointer-events-none absolute top-1/2 left-1/2 z-5 size-9 -translate-1/2 animate-[gv-spin_.7s_cubic-bezier(.4,0,.2,1)_infinite] rounded-full border-2 border-white/18 border-t-white/85"
          />
        )}

        <button
          onClick={next}
          aria-label="Next"
          className={cn(control, focusRing, 'absolute top-1/2 right-3.5 z-10 size-[42px] -translate-y-1/2 rounded-hair hover:border-white/45')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>

        <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3">
          <span className="me-1 text-[11px] font-medium tracking-[0.18em] text-white/70 uppercase tabular-nums">
            {index + 1} / {total}
          </span>

          {allowDownloads && (
            <button
              onClick={() => onDownload(img)}
              className={cn(
                control, focusRing,
                'gap-2 rounded-hair px-[18px] py-[9px] text-[11px] font-medium tracking-[0.18em] uppercase',
                'hover:-translate-y-px hover:border-white hover:bg-white hover:text-ink active:translate-y-0',
              )}
            >
              <Icon name="download" size={13} strokeWidth={1.85} />
              {downloadLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
