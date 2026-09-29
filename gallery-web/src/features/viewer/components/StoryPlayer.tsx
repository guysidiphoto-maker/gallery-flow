import { useEffect, useRef, useState, useCallback } from 'react'
import type { Story } from '@/shared/types'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import './storyPlayer.css'

// Full-screen Instagram-style story player: 9:16 frame, autoplay + advance,
// arrows/swipe to navigate, space/tap to pause, Escape or backdrop to close.

interface StoryPlayerProps {
  stories: Story[]
  initialIndex: number
  storyUrl: (st: Story) => string
  onClose: () => void
}

// Used when the <video> never reports a usable duration (Instagram-like 10s).
const FALLBACK_DURATION_MS = 10_000

// Vertical swipe distance (px) needed to flip stories.
const SWIPE_THRESHOLD = 60

const tapZone = 'absolute inset-y-0 z-[2] w-[30%] cursor-pointer bg-transparent'

export function StoryPlayer({ stories, initialIndex, storyUrl, onClose }: StoryPlayerProps) {
  const safeStart = Math.min(Math.max(initialIndex, 0), Math.max(stories.length - 1, 0))
  const [index, setIndex] = useState(safeStart)
  const [paused, setPaused] = useState(false)
  // 0..1 for the active story: from timeupdate when a duration exists, else wall clock.
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackStartRef = useRef<number>(performance.now())
  const fallbackElapsedRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose)

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex(i => {
      if (i >= stories.length - 1) {
        onClose()
        return i
      }
      return i + 1
    })
  }, [stories.length, onClose])

  const togglePause = useCallback(() => {
    setPaused(p => {
      const v = videoRef.current
      if (!v) return !p
      if (p) { void v.play().catch(() => { /* autoplay may reject silently */ }) }
      else   { v.pause() }
      return !p
    })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault(); goPrev(); break
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault(); goNext(); break
        case ' ':
        case 'Spacebar':
          e.preventDefault(); togglePause(); break
        // Escape is handled by useFocusTrap → onClose.
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, togglePause])

  useEffect(() => {
    setProgress(0)
    fallbackStartRef.current = performance.now()
    fallbackElapsedRef.current = 0
    setPaused(false)
  }, [index])

  // The rAF loop always runs but only drives progress while the video has no
  // duration metadata; otherwise onTimeUpdate wins.
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current
      const hasNativeDuration = !!v && Number.isFinite(v.duration) && v.duration > 0
      if (!hasNativeDuration && !paused) {
        const now = performance.now()
        const elapsed = fallbackElapsedRef.current + (now - fallbackStartRef.current)
        const ratio = Math.min(1, elapsed / FALLBACK_DURATION_MS)
        setProgress(ratio)
        if (ratio >= 1) {
          goNext()
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    if (paused) {
      // Freeze the wall clock so it resumes from the same offset.
      const now = performance.now()
      fallbackElapsedRef.current += (now - fallbackStartRef.current)
    } else {
      fallbackStartRef.current = performance.now()
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [paused, goNext])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: performance.now() }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (absY > SWIPE_THRESHOLD && absY > absX) {
      // Up = next, down = previous (Reels convention).
      if (dy < 0) goNext(); else goPrev()
    } else if (absX < 10 && absY < 10) {
      togglePause()
    }
  }

  if (stories.length === 0) return null
  const active = stories[index]
  if (!active) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Story player"
      className="fixed inset-0 z-[9000] flex animate-[story-player-fade-in_.18s_ease-out] items-center justify-center bg-black/94"
      onClick={(e) => {
        // Close only on the backdrop, not the inner frame.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        onClick={onClose}
        aria-label="סגור"
        className="absolute end-[18px] top-[18px] z-[2] flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-[8px]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative aspect-[9/16] max-h-[92vh] w-[min(420px,92vw)] animate-[story-player-fade-in_.22s_ease-out] overflow-hidden rounded-[14px] bg-night shadow-[0_20px_60px_var(--color-black)]/50"
      >
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-[3] flex gap-1">
          {stories.map((_, i) => {
            const isActive = i === index
            const isPast = i < index
            const fill = isPast ? 1 : (isActive ? progress : 0)
            return (
              <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/28">
                <div
                  className={isActive ? 'h-full bg-white transition-[width] duration-80 ease-linear' : 'h-full bg-white'}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            )
          })}
        </div>

        {/* Side tap zones jump prev/next without dismissing. */}
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          aria-label="הסטורי הקודם"
          className={`${tapZone} start-0`}
        />
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          aria-label="הסטורי הבא"
          className={`${tapZone} end-0`}
        />

        {/* muted + playsInline: required for mobile autoplay without iOS native fullscreen. */}
        <video
          key={active.id}
          ref={videoRef}
          src={storyUrl(active)}
          autoPlay
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            // Metadata can arrive mid-playback; rebase the fallback clock.
            fallbackStartRef.current = performance.now()
            fallbackElapsedRef.current = 0
          }}
          onTimeUpdate={() => {
            const v = videoRef.current
            if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
            setProgress(Math.min(1, v.currentTime / v.duration))
          }}
          onEnded={() => goNext()}
          // Skip stories that can't load instead of stalling.
          onError={() => goNext()}
          className="block size-full bg-black object-cover"
        />

        {active.style && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[2] text-center text-[11px] font-medium tracking-[0.18em] text-white/92 uppercase text-shadow-[0_1px_4px_var(--color-black)]/60">
            {active.style}
          </div>
        )}
      </div>
    </div>
  )
}
