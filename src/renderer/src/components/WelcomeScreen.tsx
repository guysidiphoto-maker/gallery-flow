import React, { useState, useEffect } from 'react'

const TAGLINES = [
  'Organize your gallery.',
  'Pick your best shots.',
  'Deliver faster.',
]

// ─── X Glyph ─────────────────────────────────────────────────────────────────

function XGlyph({ size, uid, draw = false }: { size: number; uid: string; draw?: boolean }) {
  return (
    <svg
      className={`px-glyph${draw ? ' px-glyph--draw' : ''}`}
      width={size} height={size}
      viewBox="0 0 76 76" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}g`} x1="8" y1="8" x2="68" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#818cf8"/>
          <stop offset="48%"  stopColor="#38bdf8"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <filter id={`${uid}fg`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`${uid}fd`} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <line x1="8" y1="8" x2="68" y2="68"
        stroke={`url(#${uid}g)`} strokeWidth="3" strokeLinecap="round"
        className="px-glyph__line px-glyph__line--a" filter={`url(#${uid}fg)`}/>
      <line x1="68" y1="8" x2="8" y2="68"
        stroke={`url(#${uid}g)`} strokeWidth="3" strokeLinecap="round"
        className="px-glyph__line px-glyph__line--b" filter={`url(#${uid}fg)`}/>
      <circle cx="38" cy="38" r="3.5"
        fill="#38bdf8" className="px-glyph__dot" filter={`url(#${uid}fd)`}/>
    </svg>
  )
}

// ─── Intro text — "pi" and "flow" only, slide in / fade out ──────────────────

function IntroLetters({ wordsActive, exiting }: { wordsActive: boolean; exiting: boolean }) {
  return (
    <>
      <span className={[
        'pxw__il-pi',
        wordsActive ? 'pxw__il-pi--in'     : '',
        exiting     ? 'pxw__il-word--exit' : '',
      ].join(' ')}>pi</span>
      <span className={[
        'pxw__il-flow',
        wordsActive ? 'pxw__il-flow--in'   : '',
        exiting     ? 'pxw__il-word--exit' : '',
      ].join(' ')}>flow</span>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WelcomeScreenProps {
  onDismiss: () => void
  onNewProject: () => void
  onOpenExisting: () => void
}

export function WelcomeScreen({ onDismiss, onNewProject, onOpenExisting }: WelcomeScreenProps) {
  const [phase, setPhase]           = useState(0)
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [taglineIn, setTaglineIn]   = useState(true)
  const [sysName, setSysName]       = useState<string>('')

  useEffect(() => {
    window.api.getSystemUsername().then(name => {
      if (name) setSysName(name.toUpperCase())
    })
  }, [])

  // 1 bg  2 X-draws  3 letters-in  4 letters-out+X-rises  5 WELCOME  6 tagline  7 input+CTA
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 560),
      setTimeout(() => setPhase(3), 1520),
      setTimeout(() => setPhase(4), 2900),  // letters exit, X floats up
      setTimeout(() => setPhase(5), 3600),  // WELCOME
      setTimeout(() => setPhase(6), 4200),  // tagline
      setTimeout(() => setPhase(7), 4800),  // input + CTA
    ]
    return () => t.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (phase < 6) return
    const id = setInterval(() => {
      setTaglineIn(false)
      setTimeout(() => { setTaglineIdx(i => (i + 1) % TAGLINES.length); setTaglineIn(true) }, 460)
    }, 2600)
    return () => clearInterval(id)
  }, [phase])

  const handleNewProject = (e: React.MouseEvent) => { e.stopPropagation(); onNewProject() }
  const handleOpenExisting = (e: React.MouseEvent) => { e.stopPropagation(); onOpenExisting() }

  return (
    <div className="pxw">

      <div className={`pxw__grid ${phase >= 1 ? 'pxw__grid--in' : ''}`} />

      <div className="pxw__particles" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <span key={i} className="pxw__particle" style={{
            '--px':   `${(i * 4.73 + 3) % 92}%`,
            '--pd':   `${(i * 0.57) % 5.2}s`,
            '--ps':   `${1 + (i % 3) * 0.55}px`,
            '--dur':  `${8 + (i % 7) * 1.2}s`,
            '--drift':`${-18 + (i % 5) * 9}px`,
          } as React.CSSProperties} />
        ))}
      </div>

      <div className={`pxw__orb ${phase >= 2 ? 'pxw__orb--in' : ''}`} />

      {(['tl','tr','bl','br'] as const).map((pos, i) => (
        <div key={pos}
          className={`pxw__corner pxw__corner--${pos} ${phase >= 1 ? 'pxw__corner--in' : ''}`}
          style={{ transitionDelay: `${0.08 + i * 0.09}s` }}
        />
      ))}

      {/* ── Single X — starts centered, floats up on phase 4 ── */}
      {phase >= 2 && (
        <div className={`pxw__float-x ${phase >= 4 ? 'pxw__float-x--risen' : ''}`}>
          <XGlyph size={80} uid="pxF" draw={phase >= 2} />
        </div>
      )}

      {/* ── "pi" and "flow" letters (separate layer, same center) ── */}
      {phase >= 3 && phase < 5 && (
        <div className="pxw__scene-intro">
          <IntroLetters wordsActive={phase >= 3} exiting={phase >= 4} />
        </div>
      )}

      {/* ── Main content: WELCOME, tagline, input, CTA ── */}
      <div className={`pxw__scene-main ${phase >= 5 ? 'pxw__scene-main--in' : ''}`}
        onClick={e => e.stopPropagation()}>

        {/* Spacer that holds room for the X above */}
        <div className="pxw__x-spacer" />

        <div className={`pxw__welcome ${phase >= 5 ? 'pxw__welcome--in' : ''}`}>
          WELCOME{sysName ? `, ${sysName}` : ''}
        </div>

        <div className={`pxw__tagline-wrap ${phase >= 6 ? 'pxw__tagline-wrap--in' : ''}`}>
          <span className={`pxw__tagline ${taglineIn ? 'pxw__tagline--in' : 'pxw__tagline--out'}`}>
            {TAGLINES[taglineIdx]}
          </span>
        </div>

        <div className={`pxw__actions ${phase >= 7 ? 'pxw__actions--in' : ''}`}>
          <button className="pxw__cta" onClick={handleNewProject}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
          <button className="pxw__btn-open" onClick={handleOpenExisting}>Open Existing Project</button>
        </div>

      </div>
    </div>
  )
}
