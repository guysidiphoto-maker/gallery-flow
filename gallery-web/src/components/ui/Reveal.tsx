// Reveal — premium scroll-triggered entrance. IntersectionObserver-based (no
// GSAP, no scroll-pinning → no jank), respects prefers-reduced-motion. Wrap any
// block to fade + rise it as it enters the viewport. Use `delay` to stagger
// groups (e.g. cards by index). Deliberately subtle — taste over spectacle.

import React, { useEffect, useRef, useState } from 'react'
import { ease } from '../../theme'

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  delay?: number   // ms — stagger within a group
  y?: number       // px rise distance (default 24)
  duration?: number // ms (default 700)
  once?: boolean   // animate only the first time (default true)
}

export function Reveal({
  delay = 0, y = 24, duration = 700, once = true, style, children, ...rest
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); if (once) io.disconnect() }
      else if (!once) setShown(false)
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [once])

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px)`,
        transition: `opacity ${duration}ms ${ease.out} ${delay}ms, transform ${duration}ms ${ease.out} ${delay}ms`,
        willChange: 'opacity, transform',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
