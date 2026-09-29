// Decides whether this device renders the Three.js scene (lite on non-desktop) or
// the static story. First paint is always the safe fallback: no canvas, no motion.

import { useEffect, useState } from 'react'

export interface DeviceCapability {
  /** Render the Three.js canvas (desktop and mobile). */
  use3D: boolean
  /** Low-power / non-desktop: the 3D scene runs in a lighter mode. */
  lite: boolean
  /** Resolved after mount. */
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

// Wide viewport, fine pointer and not memory-starved. Conservative: when unsure, lite.
function isDesktopClass(): boolean {
  const wideEnough = window.innerWidth >= 1024
  const finePointer = window.matchMedia('(pointer: fine)').matches
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const enoughMemory = mem === undefined || mem >= 4
  const cores = navigator.hardwareConcurrency ?? 8
  return wideEnough && finePointer && enoughMemory && cores >= 4
}

export function useDeviceCapability(): DeviceCapability {
  const [cap, setCap] = useState<DeviceCapability>({ use3D: false, lite: true, ready: false })

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Static fallback only for reduced-motion or no-WebGL devices.
    const use3D = !reducedMotion && webglAvailable()
    setCap({ use3D, lite: !isDesktopClass(), ready: true })
  }, [])

  return cap
}
