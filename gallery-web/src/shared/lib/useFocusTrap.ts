import { useEffect, useRef } from 'react'

// Modal focus trap (WCAG 2.1.2 / 2.4.3): keeps Tab inside the dialog, restores
// focus on close, and optionally wires Escape to onEscape.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const containerRef = useRef<T | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // Ref, not a dep: an inline callback would re-run the effect every render and
  // steal focus from inputs inside the dialog.
  const onEscapeRef = useRef(onEscape)
  useEffect(() => { onEscapeRef.current = onEscape }, [onEscape])

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Fall back to the container so screen readers still announce the role.
    const queueMicrotask = (cb: () => void) => Promise.resolve().then(cb)
    queueMicrotask(() => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      if (first) first.focus()
      else { container.tabIndex = -1; container.focus() }
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.stopPropagation(); onEscapeRef.current(); return
      }
      if (e.key !== 'Tab') return
      const focusables = Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null) // visible only
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault(); last.focus()
        }
      } else {
        if (activeEl === last || !container!.contains(activeEl)) {
          e.preventDefault(); first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore focus on close
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [active])

  return containerRef
}
