// Signature face-recognition scroll moment: a beam sweeps down a grid of
// abstract portraits as the section scrolls; each face it passes gets detection
// brackets + a match chip. rAF-throttled, reduced-motion safe.
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/ui'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

// Row drives detection order (the beam descends); conf is the chip's match %.
interface Tile { swatch: string; head: string; row: number; conf: number }
const TILES: Tile[] = [
  { swatch: 'bg-(image:--mk-swatch-tan)', head: '[--mk-tile-head:var(--mk-head-tan)]', row: 0, conf: 99 },
  { swatch: 'bg-(image:--mk-swatch-sage)', head: '[--mk-tile-head:var(--mk-head-sage)]', row: 0, conf: 97 },
  { swatch: 'bg-(image:--mk-swatch-rose)', head: '[--mk-tile-head:var(--mk-head-rose)]', row: 0, conf: 98 },
  { swatch: 'bg-(image:--mk-swatch-slate)', head: '[--mk-tile-head:var(--mk-head-slate)]', row: 1, conf: 96 },
  { swatch: 'bg-(image:--mk-swatch-ochre)', head: '[--mk-tile-head:var(--mk-head-ochre)]', row: 1, conf: 99 },
  { swatch: 'bg-(image:--mk-swatch-teal)', head: '[--mk-tile-head:var(--mk-head-teal)]', row: 1, conf: 98 },
]
const ROWS = 2

const CORNER = 'absolute size-[18px] border-(--mk-sage-light) transition-all duration-[400ms] ease-out-expo motion-reduce:transition-none'
const CORNERS = [
  'top-0 left-0 border-t-[2.5px] border-l-[2.5px] rounded-tl-[4px]',
  'top-0 right-0 border-t-[2.5px] border-r-[2.5px] rounded-tr-[4px]',
  'bottom-0 left-0 border-b-[2.5px] border-l-[2.5px] rounded-bl-[4px]',
  'bottom-0 right-0 border-b-[2.5px] border-r-[2.5px] rounded-br-[4px]',
]

function FaceTile({ tile, on }: { tile: Tile; on: boolean }) {
  return (
    <div className={cn('relative aspect-[4/5] overflow-hidden rounded-[12px] shadow-card', tile.swatch, tile.head)}>
      <div className="absolute top-[30%] left-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--mk-tile-head),transparent_70%)] opacity-90 blur-[2px]" />
      <div className="absolute top-full left-1/2 aspect-square w-[78%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--mk-tile-head),transparent_65%)] opacity-85 blur-[3px]" />
      <div className={cn(
        'pointer-events-none absolute inset-x-[18%] inset-y-[14%] transition-opacity duration-[350ms] ease-out-expo motion-reduce:transition-none',
        on ? 'opacity-100' : 'opacity-0',
      )}>
        {CORNERS.map(pos => <span key={pos} className={cn(CORNER, pos, !on && 'scale-140 opacity-0')} />)}
        <span className={cn(
          'absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-(--mk-sage-light)/50 bg-(--mk-phone)/78 px-[9px] py-[3px] text-[10px] font-bold tracking-[.04em] whitespace-nowrap text-(--mk-sage-mist) backdrop-blur-[4px] transition-all duration-[400ms] ease-out-expo motion-reduce:transition-none',
          on ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
        )}>
          זוהה · {tile.conf}%
        </span>
      </div>
    </div>
  )
}

export function FaceScanShowcase() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0) // 0..1 scan progress

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setP(1); return }
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        // 0 when the stage top reaches 80% down the viewport, 1 one stage-height later.
        const start = window.innerHeight * 0.8
        setP(clamp01((start - r.top) / (r.height * 0.9)))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // A tile is "detected" once the beam has passed its row centre.
  const rowThreshold = (row: number) => (row + 0.65) / ROWS
  const detectedCount = TILES.filter(t => p >= rowThreshold(t.row)).length
  const scanning = p > 0.02 && p < 0.98

  return (
    <section className="mx-auto max-w-[1000px] px-[clamp(20px,5vw,56px)] py-12">
      <div className="mb-6 text-center">
        <h2 className="mk-h1 m-0">זיהוי פנים שמוצא כל אחד</h2>
        <p className="mk-body mx-auto mt-3 max-w-[460px] text-(--mk-ink-soft)">
          סלפי אחד, וה-AI סורק את כל האירוע ומחזיר לכל אורח רק את התמונות שלו.
        </p>
      </div>

      <div ref={ref} className="relative overflow-hidden rounded-xl border border-white/10 bg-(--mk-phone) p-[clamp(20px,4vw,40px)]">
        <div className="mk-small mb-4 flex items-center gap-2 font-(family-name:--mk-font-sans) text-(--mk-night-text)">
          <span className={cn(
            'size-2 rounded-full',
            scanning ? 'bg-(--mk-sage-light) shadow-[0_0_10px_var(--mk-sage-light)]' : 'bg-(--mk-sage-light)/50',
          )} />
          <span className="font-bold tracking-[.02em]">
            {detectedCount === TILES.length ? `${TILES.length} פנים זוהו` : scanning ? 'סורק פנים…' : 'מוכן לסריקה'}
          </span>
          <span className="ms-auto text-(--mk-night-text)/62 tabular-nums">
            {detectedCount}/{TILES.length}
          </span>
        </div>

        <div className="relative grid grid-cols-3 gap-3 px-0">
          {TILES.map((t, i) => <FaceTile key={i} tile={t} on={p >= rowThreshold(t.row)} />)}
          {/* Beam position follows scroll progress. */}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 h-0.5 bg-(image:--mk-beam) shadow-(--mk-beam-glow) transition-opacity duration-300 ease-[ease] motion-reduce:hidden',
              scanning ? 'opacity-95' : 'opacity-0',
            )}
            style={{ top: `${clamp01(p) * 100}%` }}
          />
        </div>
      </div>
    </section>
  )
}
