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
  /** Render the Three.js canvas scene (desktop AND mobile). */
  use3D: boolean
  /** OS-level reduced-motion preference. */
  reducedMotion: boolean
  /** Narrow / touch device. */
  isMobile: boolean
  /** Low-power / mobile — the 3D scene runs in a lighter mode. */
  lite: boolean
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
    lite: true,
    ready: false,
  })

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const desktop = isDesktopClass()
    // 3D runs on mobile too now (in a lighter mode). Static fallback is only
    // for no-WebGL or reduced-motion devices.
    const use3D = !reducedMotion && webglAvailable()
    setCap({ use3D, reducedMotion, isMobile: !desktop, lite: !desktop, ready: true })
  }, [])

  return cap
}
