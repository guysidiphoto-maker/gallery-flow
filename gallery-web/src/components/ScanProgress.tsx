// ScanProgress — a thin sage "scan beam" pinned to the top of the page that
// fills with scroll, led by a small detection reticle. Reinforces the
// face-recognition "scanning" language as you move down the whole page.
// rAF-throttled, reduced-motion safe (renders a static full bar).

import { useEffect, useState } from 'react'
import { color } from '../theme'

export function ScanProgress() {
  const [p, setP] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setP(1); return }
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = document.scrollingElement || document.documentElement
        const max = el.scrollHeight - el.clientHeight
        setP(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <div aria-hidden style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 300, pointerEvents: 'none' }}>
      <div style={{
        height: '100%', width: `${p * 100}%`,
        background: `linear-gradient(90deg, transparent, ${color.accent})`,
        boxShadow: `0 0 12px 1px ${color.accentBorder}`,
        transition: 'width .08s linear',
      }} />
      {/* leading detection reticle */}
      <div style={{
        position: 'absolute', top: -4, left: `calc(${p * 100}% - 5px)`,
        width: 10, height: 10, borderRadius: 2,
        border: `1.5px solid ${color.accent}`,
        boxShadow: `0 0 10px ${color.accent}`,
        background: 'rgba(123,143,110,.18)',
        transition: 'left .08s linear',
        opacity: p > 0.001 && p < 0.999 ? 1 : 0,
      }} />
    </div>
  )
}
