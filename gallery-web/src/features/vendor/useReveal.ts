import { useCallback, useRef } from 'react'

/** Callback ref that fades + lifts an element in the first time it scrolls into view. */
export function useReveal() {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)'
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })
    }
    el.style.opacity = '0'; el.style.transform = 'translateY(16px)'
    el.style.transition = 'opacity .5s ease, transform .5s ease'
    obs.current.observe(el)
  }, [])
}
