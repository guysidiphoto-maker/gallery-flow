import { useEffect, useRef, useState, useCallback } from 'react'
import type { Story } from '../types'
import { useFocusTrap } from '../lib/useFocusTrap'

// Full-screen Instagram-style story player.
//
// Vertical 9:16 frame on mobile, centered "phone" frame on desktop. Auto-plays
// the active story end-to-end, advances on completion, and supports:
//   - Up/Down arrows or swipe up/down → previous/next story
//   - Left/Right arrows → previous/next story (mirror Instagram on desktop)
//   - Space → toggle pause
//   - Escape or click on the dim backdrop → close
//   - Top progress dots (one per story); the active dot fills with playback
//
// Rendering preserves the existing public viewer's `Story` shape — we read
// the `style` (used as a label / fallback duration key) and resolve the file
// via `storyUrl`, both already used by App.tsx.

interface StoryPlayerProps {
  stories: Story[]
  initialIndex: number
  storyUrl: (st: Story) => string
  onClose: () => void
}

// Fallback when the <video> never reports a usable duration. Stories from the
// desktop renderer typically run 8–15s; 10s mirrors Instagram's image-story
// timing and is what every existing manual upload would feel like.
const FALLBACK_DURATION_MS = 10_000

// Swipe distance (px) on the Y axis required to flip stories. Anything less
// is treated as a tap, which dismisses the player.
const SWIPE_THRESHOLD = 60

export function StoryPlayer({ stories, initialIndex, storyUrl, onClose }: StoryPlayerProps) {
  const safeStart = Math.min(Math.max(initialIndex, 0), Math.max(stories.length - 1, 0))
  const [index, setIndex] = useState(safeStart)
  const [paused, setPaused] = useState(false)
  // Progress 0..1 for the active story. We update this via the <video>'s
  // timeupdate when a duration is available, otherwise via a wall-clock
  // fallback so the dots always animate predictably.
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Wall-clock fallback timer, restarted whenever `index` or `paused` changes.
  const fallbackStartRef = useRef<number>(performance.now())
  const fallbackElapsedRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  // Touch state for swipe gestures.
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose)

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex(i => {
      if (i >= stories.length - 1) {
        // Past the last story → close. Mirrors Instagram.
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

  // ─── Keyboard navigation ──────────────────────────────────────────────────
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

  // ─── Reset progress + restart fallback timer when story or pause flips ────
  useEffect(() => {
    setProgress(0)
    fallbackStartRef.current = performance.now()
    fallbackElapsedRef.current = 0
    setPaused(false)
  }, [index])

  // ─── Wall-clock progress fallback ─────────────────────────────────────────
  // Drives the progress dots whenever the <video> hasn't surfaced a duration
  // yet (slow network, codec quirks, etc). We always run the rAF loop, but
  // only commit to the visible progress when the video has no duration
  // metadata — otherwise the timeupdate handler wins.
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
      // Freeze the fallback wall clock so it resumes from the same offset.
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

  // ─── Touch / swipe gesture ────────────────────────────────────────────────
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
      // Vertical swipe — up = next, down = previous (matches Instagram Reels).
      if (dy < 0) goNext(); else goPrev()
    } else if (absX < 10 && absY < 10) {
      // Tap → toggle pause, mirroring native story players.
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
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'storyPlayerFadeIn .18s ease-out',
      }}
      onClick={(e) => {
        // Only close when the click hits the backdrop, not the inner frame.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <style>{`
        @keyframes storyPlayerFadeIn { from { opacity: 0 } to { opacity: 1 } }
        .story-player__frame { animation: storyPlayerFadeIn .22s ease-out; }
      `}</style>

      {/* Close button — fixed top-right (LTR), top-left in RTL. */}
      <button
        onClick={onClose}
        aria-label="סגור"
        style={{
          position: 'absolute', top: 18, insetInlineEnd: 18,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          border: 'none', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 2,
          backdropFilter: 'blur(8px)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Player frame — vertical 9:16 phone shape, centered. */}
      <div
        className="story-player__frame"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative',
          width: 'min(420px, 92vw)',
          aspectRatio: '9 / 16',
          maxHeight: '92vh',
          background: '#0a0a0a',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Progress dots — one per story, fill with active progress. */}
        <div style={{
          position: 'absolute', top: 10, insetInline: 10,
          display: 'flex', gap: 4, zIndex: 3,
          pointerEvents: 'none',
        }}>
          {stories.map((_, i) => {
            const isActive = i === index
            const isPast = i < index
            const fill = isPast ? 1 : (isActive ? progress : 0)
            return (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 999,
                background: 'rgba(255,255,255,0.28)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${fill * 100}%`, height: '100%',
                  background: '#fff',
                  transition: isActive ? 'width 80ms linear' : 'none',
                }} />
              </div>
            )
          })}
        </div>

        {/* Tap zones — left/right halves jump previous/next without dismissing. */}
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          aria-label="הסטורי הקודם"
          style={{
            position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0,
            width: '30%', background: 'transparent',
            border: 'none', cursor: 'pointer', zIndex: 2,
          }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          aria-label="הסטורי הבא"
          style={{
            position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0,
            width: '30%', background: 'transparent',
            border: 'none', cursor: 'pointer', zIndex: 2,
          }}
        />

        {/* The video itself. autoPlay + muted = mobile autoplay-policy compliant.
            playsInline keeps iOS from full-screening it natively. */}
        <video
          key={active.id}
          ref={videoRef}
          src={storyUrl(active)}
          autoPlay
          muted={false}
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            // Reset wall-clock fallback baseline so progress dots stay in
            // sync if the metadata arrives mid-playback.
            fallbackStartRef.current = performance.now()
            fallbackElapsedRef.current = 0
          }}
          onTimeUpdate={() => {
            const v = videoRef.current
            if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
            setProgress(Math.min(1, v.currentTime / v.duration))
          }}
          onEnded={() => goNext()}
          onError={() => {
            // Skip stories that can't load instead of stalling indefinitely.
            goNext()
          }}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            background: '#000',
          }}
        />

        {/* Style label — bottom-center, small caption. */}
        {active.style && (
          <div style={{
            position: 'absolute', bottom: 16, insetInline: 0,
            textAlign: 'center', color: 'rgba(255,255,255,0.92)',
            fontSize: 11, letterSpacing: '0.18em',
            textTransform: 'uppercase', fontWeight: 500,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            zIndex: 2,
          }}>
            {active.style}
          </div>
        )}
      </div>
    </div>
  )
}
