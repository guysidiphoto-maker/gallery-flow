import type * as THREE from 'three'

export const PLANE_H = 2.9          // hero plane height
export const HERO_Y = -1.5          // heroes sit low so the upper band stays clean for copy
export const SPACING = 6.2          // world gap between heroes along X
export const CAM_Z = 6.6
export const NARROW_CAM_Z = 8.4
export const NARROW_ASPECT = 1.05
export const FOV = 42
export const CARDS_PER_HERO = 7
export const SAGE = 0x9db089

export type Disposable = { dispose: () => void }
export type PointerRef = { current: { x: number; y: number } }
export type FocusAt = (baseX: number) => () => number

/** A floating plane (hero or orbiting card) and the values it animates around. */
export interface FloatingCard {
  mesh: THREE.Mesh
  baseX: number
  baseY: number
  baseZ: number
  phase: number
  depth: number
  focus: () => number
}

export interface HeroFx {
  lift: THREE.Mesh
  glow: THREE.Mesh
  focus: () => number
}
