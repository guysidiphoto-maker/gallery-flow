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
  const onKey = (e: { key: string; stopPropagation?: () => void; stopImmediatePropagation?: () => void }) => {
    if (e.key !== 'Escape') return
    onClose()
    // Consume the Escape so it doesn't ALSO reach an outer Escape handler on
    // the document (e.g. a modal's focus trap). Without this, pressing Escape
    // with a menu open inside the gallery editor closed both the menu AND the
    // editor. useDismiss listens in the capture phase (see below), so stopping
    // immediate propagation here prevents the bubble-phase document listeners
    // (useFocusTrap) from ever firing for this event.
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
