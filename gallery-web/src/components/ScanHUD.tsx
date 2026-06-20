// ScanHUD — a site-wide "AI camera" overlay. A fixed scan line sits across the
// middle of the viewport; as you scroll, any heading / card / image / [data-scan]
// element passing through it gets locked with face-detection brackets + a match
// chip, tracking the element like real-time face tracking. Corner reticles frame
// the viewport for the camera-HUD feel. Pure overlay (pointer-events: none),
// rAF-throttled, reduced-motion safe (renders nothing).

import React, { useEffect, useRef, useState } from 'react'
import { color, font } from '../theme'

interface Box { key: string; x: number; y: number; w: number; h: number; conf: number; op: number }

const SELECTOR = 'h1,h2,h3,img,[data-scan],.pf-card,.phone'

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

export function ScanHUD() {
  const [boxes, setBoxes] = useState<Box[]>([])
  const [scanning, setScanning] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const compute = () => {
      raf.current = 0
      const vh = window.innerHeight
      const scanY = vh * 0.46
      const band = vh * 0.16 // half-height of the focus band
      const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
      const found: Box[] = []
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect()
        if (r.width < 60 || r.height < 26 || r.top > vh || r.bottom < 0) return
        const center = r.top + r.height / 2
        const dist = Math.abs(center - scanY)
        if (dist > band) return
        found.push({
          key: `${i}`,
          x: r.left, y: r.top, w: r.width, h: r.height,
          conf: 94 + (Math.round(r.width + r.height) % 6),
          op: clamp(1 - dist / band, 0.12, 1),
        })
      })
      // keep the 2 closest to the line — elegance over clutter
      found.sort((a, b) => b.op - a.op)
      setBoxes(found.slice(0, 2))
      setScanning(found.length > 0)
    }
    const onScroll = () => { if (!raf.current) raf.current = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const id = window.setInterval(compute, 600) // catch lazy/async layout shifts
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.clearInterval(id)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  const acc = color.accent
  const corner = (cs: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14, border: `2px solid ${acc}`, ...cs,
  })

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 140, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* viewport corner reticles (camera frame) */}
      <span style={corner({ top: 18, left: 18, borderRight: 'none', borderBottom: 'none', opacity: .35 })} />
      <span style={corner({ top: 18, right: 18, borderLeft: 'none', borderBottom: 'none', opacity: .35 })} />
      <span style={corner({ bottom: 18, left: 18, borderRight: 'none', borderTop: 'none', opacity: .35 })} />
      <span style={corner({ bottom: 18, right: 18, borderLeft: 'none', borderTop: 'none', opacity: .35 })} />

      {/* the scan line */}
      <div style={{
        position: 'absolute', top: '46%', left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${acc}, transparent)`,
        opacity: scanning ? 0.5 : 0.22, transition: 'opacity .3s',
        boxShadow: scanning ? `0 0 14px 1px ${color.accentBorder}` : 'none',
      }} />
      {/* side status tag */}
      <div style={{
        position: 'absolute', top: 'calc(46% - 22px)', insetInlineStart: 22,
        ...{ fontFamily: font.sans }, fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
        color: acc, opacity: scanning ? 0.75 : 0.3, transition: 'opacity .3s',
      }}>
        ◢ FACE SCAN
      </div>

      {/* detection boxes locked onto elements crossing the line */}
      {boxes.map(b => {
        const pad = 8
        const x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2
        return (
          <div key={b.key} style={{ position: 'absolute', left: x, top: y, width: w, height: h, opacity: b.op }}>
            <span style={corner({ top: 0, left: 0, borderRight: 'none', borderBottom: 'none', borderTopLeftRadius: 4 })} />
            <span style={corner({ top: 0, right: 0, borderLeft: 'none', borderBottom: 'none', borderTopRightRadius: 4 })} />
            <span style={corner({ bottom: 0, left: 0, borderRight: 'none', borderTop: 'none', borderBottomLeftRadius: 4 })} />
            <span style={corner({ bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none', borderBottomRightRadius: 4 })} />
            <span style={{
              position: 'absolute', top: -9, insetInlineEnd: 6,
              background: 'rgba(20,20,19,.82)', color: '#E9F0E4',
              fontSize: 9, fontWeight: 700, letterSpacing: '.04em', fontFamily: font.sans,
              padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${color.accentBorder}`,
            }}>
              זוהה · {b.conf}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
