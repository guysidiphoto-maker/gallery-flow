// useDeviceCapability — decides whether this device gets the full Three.js
// cinematic scene or the lightweight static fallback. One hook, one decision,
// so Homepage3D never has to reason about it inline.
//
// The full WebGL scene is reserved for capable desktops. Phones, tablets,
// reduced-motion users, and anything without WebGL get the static story
// (same copy, same assets, same sections) — which is safe on mobile Safari and
// never leaves a blank canvas.

import { useEffect, useState } from 'react'

export interface DeviceCapability {
  /** Render the Three.js canvas scene. */
  use3D: boolean
  /** OS-level reduced-motion preference. */
  reducedMotion: boolean
  /** Narrow / touch device — gets the static story. */
  isMobile: boolean
  /** Resolved after mount (SSR/first paint renders the safe fallback). */
  ready: boolean
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

// Desktop-class heuristic: wide viewport, fine pointer (mouse), and not a
// memory-starved device. Deliberately conservative — when unsure, fall back.
function isDesktopClass(): boolean {
  const wideEnough = window.innerWidth >= 1024
  const finePointer = window.matchMedia('(pointer: fine)').matches
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const enoughMemory = mem === undefined || mem >= 4
  const cores = navigator.hardwareConcurrency ?? 8
  return wideEnough && finePointer && enoughMemory && cores >= 4
}

export function useDeviceCapability(): DeviceCapability {
  // First paint (and any SSR) is the safe fallback: no canvas, no motion.
  const [cap, setCap] = useState<DeviceCapability>({
    use3D: false,
    reducedMotion: false,
    isMobile: true,
    ready: false,
  })

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const desktop = isDesktopClass()
    const isMobile = !desktop
    const use3D = desktop && !reducedMotion && webglAvailable()

    setCap({ use3D, reducedMotion, isMobile, ready: true })

    // Re-evaluate on resize (rotate a tablet, drag a window between displays)
    // — but only downgrade live to avoid tearing down/rebuilding the canvas on
    // every pixel of a resize. If we start 3D and the window shrinks below the
    // desktop threshold, drop to the static story.
    const onResize = () => {
      setCap(prev => {
        if (!prev.use3D) return prev
        if (isDesktopClass()) return prev
        return { ...prev, use3D: false, isMobile: true }
      })
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return cap
}
