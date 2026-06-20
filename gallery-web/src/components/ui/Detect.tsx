// Detect — Reveal + the face-recognition motif. As the element enters view it
// rises in (like Reveal) AND four AI detection brackets snap onto its corners,
// settling to a subtle sage accent. Turns the whole page into one continuous
// "scan", echoing the FaceScanShowcase. Reduced-motion safe.

import React, { useEffect, useRef, useState } from 'react'
import { color, ease } from '../../theme'

export interface DetectProps extends React.HTMLAttributes<HTMLDivElement> {
  delay?: number
  y?: number
}

const CORNERS: Array<[string, React.CSSProperties]> = [
  ['tl', { top: -7, left: -7, borderTop: `2px solid ${color.accent}`, borderLeft: `2px solid ${color.accent}`, borderTopLeftRadius: 5 }],
  ['tr', { top: -7, right: -7, borderTop: `2px solid ${color.accent}`, borderRight: `2px solid ${color.accent}`, borderTopRightRadius: 5 }],
  ['bl', { bottom: -7, left: -7, borderBottom: `2px solid ${color.accent}`, borderLeft: `2px solid ${color.accent}`, borderBottomLeftRadius: 5 }],
  ['br', { bottom: -7, right: -7, borderBottom: `2px solid ${color.accent}`, borderRight: `2px solid ${color.accent}`, borderBottomRightRadius: 5 }],
]

export function Detect({ delay = 0, y = 24, style, children, ...rest }: DetectProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOn(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect() }
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        opacity: on ? 1 : 0,
        transform: on ? 'none' : `translateY(${y}px)`,
        transition: `opacity .7s ${ease.out} ${delay}ms, transform .7s ${ease.out} ${delay}ms`,
        willChange: 'opacity, transform',
        ...style,
      }}
      {...rest}
    >
      {children}
      {CORNERS.map(([k, cs]) => (
        <span key={k} aria-hidden style={{
          position: 'absolute', width: 16, height: 16, pointerEvents: 'none',
          opacity: on ? 0.65 : 0,
          transform: on ? 'none' : 'scale(1.4)',
          transition: `opacity .45s ${ease.out} ${delay + 160}ms, transform .45s ${ease.out} ${delay + 160}ms`,
          ...cs,
        }} />
      ))}
    </div>
  )
}
