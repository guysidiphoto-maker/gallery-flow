// HomepageCTA — Scene 6. Motion settles: an opaque cream section that covers
// the fixed 3D canvas, with the strong final call to action, honest trust
// bullets (no fabricated metrics), and a short FAQ. Shared by both the 3D and
// static paths.

import { useState } from 'react'
import { Button, Reveal } from '../ui'
import { color, text, font, space, radius } from '../../theme'

interface Props {
  onStart: () => void
}

const TRUST = ['חינם להתחלה', 'בלי אפליקציה לאורחים', 'מותג משלכם'] as const

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'כמה זמן לוקח להעלות אירוע?', a: 'גוררים את התמונות פעם אחת — Pixflow מסדר, בוחר רגעים ומכין את הגלריה אוטומטית.' },
  { q: 'האורחים צריכים אפליקציה?', a: 'לא. פותחים קישור בדפדפן, ועם סלפי אחד מוצאים את כל התמונות שלהם.' },
  { q: 'אפשר למתג את הגלריה?', a: 'כן — שם הסטודיו, תמונת כיסוי, פונטים וצבעים משלכם.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${color.border}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[4],
          color: color.ink, ...text.body, fontWeight: 600, fontFamily: font.sans, textAlign: 'start',
        }}
      >
        <span>{q}</span>
        <span style={{ color: color.accent, fontSize: 20, lineHeight: 1, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .25s' }}>+</span>
      </button>
      {open && (
        <p style={{ ...text.body, color: color.inkSoft, margin: `0 0 18px`, maxWidth: 560 }}>{a}</p>
      )}
    </div>
  )
}

export function HomepageCTA({ onStart }: Props) {
  return (
    <section
      id="start"
      style={{
        position: 'relative', zIndex: 2,
        background: color.bg, // opaque — covers the fixed canvas
        padding: `${space[9]}px clamp(20px, 6vw, 96px) ${space[8]}px`,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ ...text.display, fontFamily: font.display, color: color.ink, margin: 0 }}>
            מוכנים להרים גלריה?
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p style={{ ...text.body, fontSize: 18, color: color.inkSoft, margin: `${space[4]}px 0 0` }}>
            הגלריה הראשונה שלכם מוכנה בדקות. בלי כרטיס אשראי, בלי התקנה.
          </p>
        </Reveal>
        <Reveal delay={160}>
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center', flexWrap: 'wrap', marginTop: space[6] }}>
            <Button size="lg" onClick={onStart} style={{ padding: '15px 36px', fontSize: 16 }}>התחילו עכשיו</Button>
            <Button variant="secondary" size="lg" onClick={() => { window.location.href = '/demo' }}>צפו בדמו</Button>
          </div>
        </Reveal>
        <Reveal delay={220}>
          <div style={{ display: 'flex', gap: space[5], justifyContent: 'center', flexWrap: 'wrap', marginTop: space[6] }}>
            {TRUST.map(tItem => (
              <span key={tItem} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...text.small, color: color.textMuted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {tItem}
              </span>
            ))}
          </div>
        </Reveal>
      </div>

      <div style={{ maxWidth: 640, margin: `${space[9]}px auto 0` }}>
        <Reveal>
          <div style={{ ...text.label, color: color.accent, textAlign: 'center', marginBottom: space[5] }}>שאלות נפוצות</div>
        </Reveal>
        <Reveal delay={80}>
          <div style={{ background: color.surface, borderRadius: radius.lg, border: `1px solid ${color.border}`, padding: `${space[2]}px ${space[5]}px` }}>
            {FAQ.map(item => <FaqItem key={item.q} {...item} />)}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
