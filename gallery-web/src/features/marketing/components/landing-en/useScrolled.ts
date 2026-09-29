import { useEffect, useState } from 'react'

/** True once the page has scrolled past `offset` px (drives the nav backdrop). */
export function useScrolled(offset = 20) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > offset)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [offset])
  return scrolled
}
