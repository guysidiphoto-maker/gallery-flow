// useDismiss — closes a popover/menu on outside click or Escape. Returns a ref
// to attach to the popover container. Keyboard-first: Escape always closes.

import { useEffect, useRef } from 'react'

// Pure factory so the dismissal contract is unit-testable without a DOM; the
// hook and the test share it so they can't drift apart.
export function makeDismissHandlers(
  getContainer: () => { contains(node: unknown): boolean } | null,
  onClose: () => void,
) {
  const onPointer = (e: { target: unknown }) => {
    const c = getContainer()
    if (c && !c.contains(e.target)) onClose()
  }
  const onKey = (e: { key: string; stopPropagation?: () => void; stopImmediatePropagation?: () => void }) => {
    if (e.key !== 'Escape') return
    onClose()
    // Consume Escape so an enclosing modal's focus trap (bubble phase) doesn't
    // also close; we listen in the capture phase.
    e.stopPropagation?.()
    e.stopImmediatePropagation?.()
  }
  return { onPointer, onKey }
}

export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!open) return
    const { onPointer, onKey } = makeDismissHandlers(() => ref.current, onClose)
    document.addEventListener('mousedown', onPointer as (e: MouseEvent) => void)
    // Capture phase so an open popover consumes Escape before any bubble-phase
    // document handler (e.g. the editor's focus trap) can act on it.
    document.addEventListener('keydown', onKey as (e: KeyboardEvent) => void, true)
    return () => {
      document.removeEventListener('mousedown', onPointer as (e: MouseEvent) => void)
      document.removeEventListener('keydown', onKey as (e: KeyboardEvent) => void, true)
    }
  }, [open, onClose])
  return ref
}
