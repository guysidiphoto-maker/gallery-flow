import { useCallback, useRef } from 'react'

/** Ref callback that fades/slides an element in when it scrolls into view (per-element delay via data-delay). */
export function useReveal(delay = 0) {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const d = Number((e.target as HTMLElement).dataset.delay || delay)
            setTimeout(() => {
              ;(e.target as HTMLElement).style.opacity = '1'
              ;(e.target as HTMLElement).style.transform = 'none'
            }, d)
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.05 })
    }
    el.style.opacity = '0'
    el.style.transform = 'translateY(40px)'
    el.style.transition = 'opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1)'
    requestAnimationFrame(() => obs.current?.observe(el))
  }, [delay])
}
