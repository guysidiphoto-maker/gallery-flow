// Site-wide "AI camera" overlay: a fixed scan line locks face-detection brackets
// onto headings/cards/images crossing it as you scroll. Pure overlay,
// rAF-throttled, renders nothing under reduced motion.
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/ui'

interface Box { key: string; x: number; y: number; w: number; h: number; conf: number; op: number }

const SELECTOR = 'h1,h2,h3,img,[data-scan],.pf-card,.phone'

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

const CORNER = 'absolute size-3.5 border-sage'
const RETICLES = [
  'top-[18px] left-[18px] border-t-2 border-l-2',
  'top-[18px] right-[18px] border-t-2 border-r-2',
  'bottom-[18px] left-[18px] border-b-2 border-l-2',
  'bottom-[18px] right-[18px] border-b-2 border-r-2',
]
const BRACKETS = [
  'top-0 left-0 border-t-2 border-l-2 rounded-tl-[4px]',
  'top-0 right-0 border-t-2 border-r-2 rounded-tr-[4px]',
  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-[4px]',
  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-[4px]',
]

export function ScanHUD() {
  const [boxes, setBoxes] = useState<Box[]>([])
  const [scanning, setScanning] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
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
        const dist = Math.abs(r.top + r.height / 2 - scanY)
        if (dist > band) return
        found.push({
          key: `${i}`,
          x: r.left, y: r.top, w: r.width, h: r.height,
          conf: 94 + (Math.round(r.width + r.height) % 6),
          op: clamp(1 - dist / band, 0.12, 1),
        })
      })
      // Only the 2 closest to the line: elegance over clutter.
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

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[140] overflow-hidden">
      {RETICLES.map(pos => <span key={pos} className={cn(CORNER, 'opacity-35', pos)} />)}

      <div className={cn(
        'absolute inset-x-0 top-[46%] h-px bg-(image:--mk-scan-line) transition-opacity duration-300 ease-[ease]',
        scanning ? 'opacity-50 shadow-(--mk-scan-glow)' : 'opacity-22',
      )} />
      <div className={cn(
        'absolute start-[22px] top-[calc(46%-22px)] font-(family-name:--mk-font-sans) text-[10px] font-bold tracking-[.12em] text-sage transition-opacity duration-300 ease-[ease]',
        scanning ? 'opacity-75' : 'opacity-30',
      )}>
        ◢ FACE SCAN
      </div>

      {boxes.map(b => {
        const pad = 8
        return (
          <div
            key={b.key}
            className="absolute"
            style={{ left: b.x - pad, top: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, opacity: b.op }}
          >
            {BRACKETS.map(pos => <span key={pos} className={cn(CORNER, pos)} />)}
            <span className="absolute -top-[9px] end-1.5 rounded-full border border-sage/40 bg-ink/82 px-[7px] py-0.5 font-(family-name:--mk-font-sans) text-[9px] font-bold tracking-[.04em] whitespace-nowrap text-(--mk-sage-mist)">
              זוהה · {b.conf}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
