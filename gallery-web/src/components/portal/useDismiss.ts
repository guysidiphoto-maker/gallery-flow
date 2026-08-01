// useDismiss — closes a popover/menu on outside click or Escape. Returns a ref
// to attach to the popover container. Keyboard-first: Escape always closes.

import { useEffect, useRef } from 'react'

// Pure handler factory — extracted so the dismissal contract (outside pointer
// closes, inside pointer does NOT, Escape closes, other keys ignored) can be
// unit-tested without a DOM/React runtime. Both the hook and the regression
// test build their listeners from here so they can never drift apart.
export function makeDismissHandlers(
  getContainer: () => { contains(node: unknown): boolean } | null,
  onClose: () => void,
) {
  const onPointer = (e: { target: unknown }) => {
    const c = getContainer()
    if (c && !c.contains(e.target)) onClose()
  }
  const onKey = (e: { key: string }) => {
    if (e.key === 'Escape') onClose()
  }
  return { onPointer, onKey }
}

export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!open) return
    const { onPointer, onKey } = makeDismissHandlers(() => ref.current, onClose)
    document.addEventListener('mousedown', onPointer as (e: MouseEvent) => void)
    document.addEventListener('keydown', onKey as (e: KeyboardEvent) => void)
    return () => {
      document.removeEventListener('mousedown', onPointer as (e: MouseEvent) => void)
      document.removeEventListener('keydown', onKey as (e: KeyboardEvent) => void)
    }
  }, [open, onClose])
  return ref
}
