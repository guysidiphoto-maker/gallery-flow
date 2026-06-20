// FaceScanShowcase — the signature "this is face recognition" scroll moment.
// As the section travels through the viewport, a scan beam sweeps top→bottom
// over a grid of portrait tiles; each face it crosses gets AI detection
// brackets that snap in + a match-confidence chip, and a live "X faces found"
// readout ticks up. Scroll-linked (rAF-throttled), jank-free, reduced-motion safe.

import { useEffect, useRef, useState } from 'react'
import { color, text, space, radius, font, ease } from '../theme'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

// Abstract warm-toned portrait tiles. row drives detection order (top rows
// light up first as the beam descends). conf = match % shown on the chip.
interface Tile { g: string; head: string; row: number; conf: number }
const TILES: Tile[] = [
  { g: 'linear-gradient(150deg,#C8B49E,#A98F76)', head: '#E7D8C6', row: 0, conf: 99 },
  { g: 'linear-gradient(150deg,#9FB0A0,#7B8F6E)', head: '#CBD6C4', row: 0, conf: 97 },
  { g: 'linear-gradient(150deg,#C7A6A6,#A87E7E)', head: '#E6D2D2', row: 0, conf: 98 },
  { g: 'linear-gradient(150deg,#A8AEB8,#7E8694)', head: '#D3D8E0', row: 1, conf: 96 },
  { g: 'linear-gradient(150deg,#C9B98F,#A8965F)', head: '#E8DDBE', row: 1, conf: 99 },
  { g: 'linear-gradient(150deg,#9FAFB0,#6E8A8A)', head: '#C9D8D8', row: 1, conf: 98 },
]
const ROWS = 2

const STYLE_ID = 'fs-styles'
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    .fs-tile{position:relative;aspect-ratio:4/5;border-radius:${radius.md}px;overflow:hidden;
      box-shadow:0 8px 24px rgba(20,20,19,.10)}
    .fs-head{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);width:46%;aspect-ratio:1;
      border-radius:50%;filter:blur(2px);opacity:.9}
    .fs-body{position:absolute;left:50%;top:100%;transform:translateX(-50%);width:78%;aspect-ratio:1;
      border-radius:50%;filter:blur(3px);opacity:.85}
    .fs-box{position:absolute;inset:14% 18%;pointer-events:none;opacity:0;transition:opacity .35s ${ease.out}}
    .fs-box.on{opacity:1}
    .fs-corner{position:absolute;width:18px;height:18px;border:2.5px solid ${color.dark.accent};
      transition:all .4s ${ease.out}}
    .fs-box .fs-tl{top:0;left:0;border-right:none;border-bottom:none;border-top-left-radius:4px}
    .fs-box .fs-tr{top:0;right:0;border-left:none;border-bottom:none;border-top-right-radius:4px}
    .fs-box .fs-bl{bottom:0;left:0;border-right:none;border-top:none;border-bottom-left-radius:4px}
    .fs-box .fs-br{bottom:0;right:0;border-left:none;border-top:none;border-bottom-right-radius:4px}
    .fs-box:not(.on) .fs-corner{transform:scale(1.4);opacity:0}
    .fs-chip{position:absolute;bottom:8px;left:50%;transform:translateX(-50%) translateY(6px);
      background:rgba(14,14,16,.78);color:#E9F0E4;font-size:10px;font-weight:700;letter-spacing:.04em;
      padding:3px 9px;border-radius:999px;white-space:nowrap;opacity:0;transition:all .4s ${ease.out};
      backdrop-filter:blur(4px);border:1px solid rgba(157,176,137,.5)}
    .fs-box.on .fs-chip{opacity:1;transform:translateX(-50%) translateY(0)}
    .fs-beam{position:absolute;left:0;right:0;height:2px;pointer-events:none;
      background:linear-gradient(90deg,transparent,${color.dark.accent},transparent);
      box-shadow:0 0 16px 2px rgba(123,143,110,.55);opacity:.9;transition:opacity .3s}
    @media(prefers-reduced-motion:reduce){
      .fs-box,.fs-corner,.fs-chip{transition:none}
      .fs-beam{display:none}
    }
  `
  document.head.appendChild(el)
}

export function FaceScanShowcase() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0) // 0..1 scan progress

  useEffect(() => {
    ensureStyles()
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setP(1); return }
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        // 0 when the stage top reaches 80% down the viewport, 1 once it has
        // travelled one stage-height further up.
        const start = vh * 0.8
        const prog = clamp01((start - r.top) / (r.height * 0.9))
        setP(prog)
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
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: `${space[7]}px clamp(20px, 5vw, 56px)` }}>
      <div style={{ textAlign: 'center', marginBottom: space[5] }}>
        <h2 style={{ ...text.h1, margin: 0 }}>זיהוי פנים שמוצא כל אחד</h2>
        <p style={{ ...text.body, color: color.inkSoft, margin: `${space[3]}px auto 0`, maxWidth: 460 }}>
          סלפי אחד, וה-AI סורק את כל האירוע ומחזיר לכל אורח רק את התמונות שלו.
        </p>
      </div>

      {/* Scan stage */}
      <div ref={ref} style={{
        position: 'relative', borderRadius: radius.xl, overflow: 'hidden',
        background: color.dark.bg, padding: `clamp(20px,4vw,40px)`,
        border: `1px solid ${color.dark.border}`,
      }}>
        {/* live readout */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[4],
          ...text.small, fontFamily: font.sans, color: color.dark.text,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: scanning ? color.dark.accent : 'rgba(157,176,137,.5)',
            boxShadow: scanning ? `0 0 10px ${color.dark.accent}` : 'none',
          }} />
          <span style={{ fontWeight: 700, letterSpacing: '.02em' }}>
            {detectedCount === TILES.length ? `${TILES.length} פנים זוהו` : scanning ? 'סורק פנים…' : 'מוכן לסריקה'}
          </span>
          <span style={{ marginInlineStart: 'auto', color: color.dark.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {detectedCount}/{TILES.length}
          </span>
        </div>

        {/* grid */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[3] }}>
          {TILES.map((t, i) => {
            const on = p >= rowThreshold(t.row)
            return (
              <div key={i} className="fs-tile" style={{ background: t.g }}>
                <div className="fs-head" style={{ background: `radial-gradient(circle, ${t.head}, transparent 70%)` }} />
                <div className="fs-body" style={{ background: `radial-gradient(circle, ${t.head}, transparent 65%)` }} />
                <div className={`fs-box ${on ? 'on' : ''}`}>
                  <span className="fs-corner fs-tl" /><span className="fs-corner fs-tr" />
                  <span className="fs-corner fs-bl" /><span className="fs-corner fs-br" />
                  <span className="fs-chip">זוהה · {t.conf}%</span>
                </div>
              </div>
            )
          })}

          {/* scan beam — vertical position follows scroll progress */}
          <div className="fs-beam" style={{ top: `${clamp01(p) * 100}%`, opacity: scanning ? 0.95 : 0 }} />
        </div>
      </div>
    </section>
  )
}
