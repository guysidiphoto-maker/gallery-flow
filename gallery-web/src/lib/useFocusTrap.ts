import { useEffect, useRef } from 'react'

// Focus trap for modals. Required for WCAG 2.1.2 / 2.4.3 — once a dialog
// opens, keyboard users must not be able to tab out of it into the
// background page. Restores focus to whatever was active before the modal
// opened when the dialog closes (Escape or programmatic).
//
// Usage:
//   const ref = useFocusTrap(isOpen)
//   <div role="dialog" ref={ref}>...</div>
//
// Accepts an optional onEscape callback so callers can wire Escape to
// dismiss the modal without re-implementing the listener at each site.

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

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Move focus to the first focusable element in the dialog (or the
    // container itself as a fallback so screen readers announce the role).
    const queueMicrotask = (cb: () => void) => Promise.resolve().then(cb)
    queueMicrotask(() => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      if (first) first.focus()
      else { container.tabIndex = -1; container.focus() }
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); return }
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
  }, [active, onEscape])

  return containerRef
}
