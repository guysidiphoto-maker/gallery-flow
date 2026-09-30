import type { CSSProperties } from 'react'

export interface TargetRect { top: number; left: number; width: number; height: number }

export function findTourTarget(target: string): Element | null {
  const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(target)
    : target.replace(/["\\]/g, '\\$&')
  return document.querySelector(`[data-tour="${esc}"]`)
}

export function measureTarget(target?: string): TargetRect | null {
  if (!target || typeof document === 'undefined') return null
  const el = findTourTarget(target)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

// Keep in sync with the card's w-[340px].
const CARD_WIDTH = 340
export const SPOT_PAD = 6

/** Anchored offsets for the card next to the highlighted target (desktop only). */
export function cardPlacement(rect: TargetRect | null, isMobile: boolean, dir: 'rtl' | 'ltr'): CSSProperties {
  const placement: CSSProperties = {}
  if (isMobile || !rect) return placement
  const vw = window.innerWidth
  const vh = window.innerHeight
  const estCardHeight = 250
  const below = rect.top + rect.height + estCardHeight + 24 < vh
  if (below) placement.top = Math.max(12, rect.top + rect.height + SPOT_PAD + 12)
  else placement.bottom = Math.max(12, vh - rect.top + SPOT_PAD + 12)
  if (dir === 'rtl') {
    const fromRight = vw - (rect.left + rect.width)
    placement.right = Math.min(Math.max(12, fromRight), Math.max(12, vw - CARD_WIDTH - 12))
  } else {
    placement.left = Math.min(Math.max(12, rect.left), Math.max(12, vw - CARD_WIDTH - 12))
  }
  return placement
}
