import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSections } from '../store/sections'

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepDef {
  id: string
  spotlight?: string
  pad?: number
  headline: string
  body?: string
  side?: 'top' | 'bottom'
  fullScreen?: boolean
  action?: 'pick-first' | 'pick-three' | 'add-section' | 'move-top'
  keyHint?: string
  emoji?: string
  ctaLabel?: string       // override "Next →"
  interactHint?: string   // e.g. "Try dragging a photo"
}

const STEPS: StepDef[] = [
  // ── 0 ── intro
  {
    id: 'intro',
    fullScreen: true,
    headline: 'Finish your event\nin minutes.',
  },

  // ── 1 ── the grid
  {
    id: 'gallery',
    spotlight: '.gallery-justified',
    pad: 14,
    headline: 'Justified grid',
    body: 'Every row fills the full width automatically. Drag any photo to a new position — the grid reflows instantly.',
    side: 'top',
    emoji: '⊞',
    interactHint: 'Try dragging a photo',
  },

  // ── 2 ── sort
  {
    id: 'sort',
    spotlight: '[data-demo="sort"]',
    pad: 8,
    headline: 'Sort any way',
    body: 'Sort by filename, shooting date (reads EXIF), or shuffle for a fresh creative order. The sequence you set here is what gets renamed and exported.',
    side: 'bottom',
    emoji: '↕',
  },

  // ── 3 ── top picks
  {
    id: 'picks',
    spotlight: '.image-card:first-child',
    pad: 8,
    headline: 'Mark Top Picks',
    body: 'Press T on any photo to flag it as a Top Pick. Picks are the foundation of your Story video and Social export.',
    side: 'bottom',
    action: 'pick-three',
    keyHint: 'T',
    emoji: '★',
    ctaLabel: 'Mark picks & continue',
  },

  // ── 4 ── sections
  {
    id: 'sections',
    spotlight: '[data-demo="sections"]',
    pad: 8,
    headline: 'Sections',
    body: 'Create named sections — "Client", "Instagram", "BTS". Assign any photo to multiple sections. Each section exports as its own folder with sequential numbering.',
    side: 'bottom',
    action: 'add-section',
    emoji: '📂',
    ctaLabel: 'Create section & continue',
  },

  // ── 5 ── apply order
  {
    id: 'apply-order',
    spotlight: '[data-demo="apply-order"]',
    pad: 10,
    headline: 'Apply Order',
    body: 'Renames every file to match your visual sequence — 0001.jpg, 0002.jpg… Optional prefix (e.g. wedding_0001.jpg). Irreversible, with undo history.',
    side: 'bottom',
    emoji: '↻',
    interactHint: 'Click to see the rename preview',
  },

  // ── 6 ── story
  {
    id: 'story',
    spotlight: '[data-demo="story"]',
    pad: 10,
    headline: 'Story Video',
    body: 'Your Top Picks become a cinematic vertical video — smooth Ken Burns motion, optional logo fade-in outro. Renders locally, no cloud upload.',
    side: 'bottom',
    emoji: '🎬',
    interactHint: 'Click to open Story builder',
  },

  // ── 7 ── social
  {
    id: 'social',
    spotlight: '.btn--social',
    pad: 10,
    headline: 'Social Export',
    body: 'Exports picks as a social media package — resized images, order overlay, grid preview. Ready to upload to Instagram or hand off to a client.',
    side: 'bottom',
    emoji: '📱',
  },

  // ── 8 ── preview mode
  {
    id: 'preview',
    spotlight: '[title="Client preview mode"]',
    pad: 8,
    headline: 'Client Preview',
    body: 'Show your selection to a client without the editing UI — clean grid, full-screen lightbox, no distractions.',
    side: 'bottom',
    emoji: '👁',
  },

  // ── 9 ── done
  {
    id: 'done',
    fullScreen: true,
    headline: "You're ready.",
    body: 'Everything you just saw takes under 2 minutes on a real shoot.',
  },
]

const CONTENT_STEPS = STEPS.filter(s => !s.fullScreen)

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SpotRect { top: number; left: number; width: number; height: number }

function measureEl(selector: string, pad: number): SpotRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 }
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function LogoMark({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <rect x="8" y="8" width="56" height="56" rx="12" transform="rotate(45 36 36)"
        stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
      <rect x="18" y="18" width="36" height="36" rx="6"
        stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <circle cx="27" cy="29" r="3" fill="currentColor" opacity="0.45"/>
      <circle cx="36" cy="29" r="3" fill="currentColor" opacity="0.45"/>
      <circle cx="45" cy="29" r="3" fill="currentColor" opacity="0.45"/>
      <circle cx="27" cy="43" r="3" fill="currentColor" opacity="0.45"/>
      <circle cx="36" cy="43" r="3" fill="currentColor" opacity="0.45"/>
      <circle cx="45" cy="43" r="4.5" fill="currentColor"/>
      <path d="M45 39.8l.9 2.6h2.8l-2.3 1.7.9 2.6-2.3-1.7-2.3 1.7.9-2.6-2.3-1.7h2.8z" fill="#0a0a0a"/>
    </svg>
  )
}

// ─── Key hint ─────────────────────────────────────────────────────────────────

function KeyHint({ label }: { label: string }) {
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    const cycle = () => {
      setPressed(true)
      setTimeout(() => setPressed(false), 160)
    }
    cycle()
    const id = setInterval(cycle, 1800)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="demo-key-hint">
      <span className="demo-key-hint__label">Press</span>
      <div className={`demo-key ${pressed ? 'pressed' : ''}`}>{label}</div>
      <span className="demo-key-hint__label">to mark as Top Pick</span>
    </div>
  )
}

// ─── DemoMode ─────────────────────────────────────────────────────────────────

export function DemoMode({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null)
  const [cardVisible, setCardVisible] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const actionsRan = useRef(new Set<string>())

  const images     = useGallery(s => s.images)
  const toggleTopPick = useGallery(s => s.toggleTopPick)
  const reloadFolder  = useGallery(s => s.reloadFolder)
  const moveToTop     = useGallery(s => s.moveToTop)
  const addSection    = useSections(s => s.addSection)

  const step = STEPS[stepIdx]

  // ── Load demo images when no folder is open ───────────────────────────────

  useEffect(() => {
    if (images.length > 0 || step.fullScreen) return
    setDemoLoading(true)
    const paths = ['/Library/Desktop Pictures', '/System/Library/Desktop Pictures']
    let i = 0
    const tryNext = async () => {
      if (i >= paths.length) { setDemoLoading(false); return }
      try {
        useGallery.setState({ folderPath: paths[i++] })
        await reloadFolder()
        setDemoLoading(false)
      } catch { tryNext() }
    }
    tryNext()
  }, [stepIdx, images.length, step.fullScreen])

  // ── Run action for this step (once) ───────────────────────────────────────

  const runAction = useCallback((s: StepDef) => {
    if (!s.action || actionsRan.current.has(s.id)) return
    actionsRan.current.add(s.id)

    if (s.action === 'pick-first' && images.length > 0) {
      setTimeout(() => toggleTopPick(images[0].id), 500)
    }
    if (s.action === 'pick-three' && images.length > 0) {
      setTimeout(() => toggleTopPick(images[0].id), 400)
      setTimeout(() => toggleTopPick(images[1]?.id ?? images[0].id), 900)
      setTimeout(() => toggleTopPick(images[2]?.id ?? images[0].id), 1400)
    }
    if (s.action === 'add-section') {
      setTimeout(() => addSection('Client Gallery'), 500)
    }
    if (s.action === 'move-top' && images.length > 1) {
      setTimeout(() => moveToTop(images[2]?.id ?? images[1].id), 600)
    }
  }, [images, toggleTopPick, addSection, moveToTop])

  // ── On step change ────────────────────────────────────────────────────────

  useEffect(() => {
    setCardVisible(false)

    if (!step.spotlight) {
      setSpotRect(null)
      const t = setTimeout(() => setCardVisible(true), 80)
      return () => clearTimeout(t)
    }

    let attempts = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    const measure = () => {
      const r = measureEl(step.spotlight!, step.pad ?? 8)
      if (r) {
        setSpotRect(r)
        timers.push(setTimeout(() => { setCardVisible(true); runAction(step) }, 150))
      } else if (attempts++ < 12) {
        timers.push(setTimeout(measure, 100))
      }
    }
    measure()

    return () => timers.forEach(clearTimeout)
  }, [stepIdx])

  const advance = useCallback(() => {
    if (stepIdx >= STEPS.length - 1) { onDone(); return }
    setStepIdx(i => i + 1)
  }, [stepIdx, onDone])

  const goBack = useCallback(() => {
    if (stepIdx <= 1) return
    setStepIdx(i => i - 1)
  }, [stepIdx])

  const replay = () => {
    actionsRan.current.clear()
    setStepIdx(0)
  }

  // ── Full-screen steps ─────────────────────────────────────────────────────

  // For full-screen steps, trigger visible after short delay
  const [fsVisible, setFsVisible] = useState(false)
  useEffect(() => {
    if (!step.fullScreen) return
    setFsVisible(false)
    const t = setTimeout(() => setFsVisible(true), 120)
    return () => clearTimeout(t)
  }, [stepIdx, step.fullScreen])

  if (step.fullScreen) {
    return (
      <div className="demo-fs">
        <div className="demo-fs__grid" />
        <div className="demo-fs__scan" />
        <div className="demo-fs__orb" />
        <div className="demo-corner demo-corner--tl"/>
        <div className="demo-corner demo-corner--tr"/>
        <div className="demo-corner demo-corner--bl"/>
        <div className="demo-corner demo-corner--br"/>

        {step.id === 'intro' && (
          <div className={`demo-intro ${fsVisible ? 'demo-intro--visible' : ''}`}>
            <div className="demo-intro__logo"><LogoMark size={56} /></div>
            <h1 className="demo-intro__headline">
              {step.headline.split('\n').map((l, i) => <span key={i}>{l}</span>)}
            </h1>
            <p className="demo-intro__sub">Guided walkthrough · {CONTENT_STEPS.length} features</p>
            <div className="demo-intro__actions">
              <button className="demo-btn-primary" onClick={advance}>
                Start demo
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <button className="demo-btn-ghost" onClick={onDone}>Skip</button>
            </div>
          </div>
        )}

        {step.id === 'done' && (
          <div className={`demo-done ${fsVisible ? 'demo-done--visible' : ''}`}>
            <div className="demo-done__check">✓</div>
            <h1 className="demo-done__headline">{step.headline}</h1>
            <p className="demo-done__body">{step.body}</p>
            <div className="demo-done__actions">
              <button className="demo-btn-primary" onClick={onDone}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Open my folder
              </button>
              <button className="demo-btn-ghost" onClick={replay}>Replay</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Card position ─────────────────────────────────────────────────────────

  const CARD_W = 310
  const CARD_H_APPROX = 220
  const GAP = 14
  let cardStyle: React.CSSProperties = { width: CARD_W, position: 'fixed' }

  if (spotRect) {
    let top: number
    let left = spotRect.left + spotRect.width / 2 - CARD_W / 2
    left = Math.max(12, Math.min(left, window.innerWidth - CARD_W - 12))

    if (step.side === 'top') {
      top = spotRect.top - CARD_H_APPROX - GAP
      if (top < 56) top = spotRect.top + spotRect.height + GAP
    } else {
      top = spotRect.top + spotRect.height + GAP
      if (top + CARD_H_APPROX > window.innerHeight - 20) {
        top = spotRect.top - CARD_H_APPROX - GAP
      }
    }

    cardStyle = { ...cardStyle, top, left }
  }

  const contentIdx = CONTENT_STEPS.indexOf(step)

  return (
    <>
      <div className="demo-overlay" onClick={advance} />

      {spotRect && (
        <div
          className="demo-spotlight"
          style={{ top: spotRect.top, left: spotRect.left, width: spotRect.width, height: spotRect.height }}
        />
      )}

      {demoLoading && (
        <div className="demo-loading">
          <div className="demo-loading__spinner"/>
          <span>Loading demo images…</span>
        </div>
      )}

      <div
        className={`demo-card ${cardVisible ? 'demo-card--visible' : ''}`}
        style={cardStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Dots + counter */}
        <div className="demo-card__top">
          <div className="demo-card__dots">
            {CONTENT_STEPS.map((s, i) => (
              <button
                key={s.id}
                className={`demo-card__dot ${i === contentIdx ? 'active' : i < contentIdx ? 'done' : ''}`}
                onClick={() => setStepIdx(STEPS.indexOf(s))}
                aria-label={`Step ${i + 1}: ${s.headline}`}
                title={s.headline}
              />
            ))}
          </div>
          <span className="demo-card__counter">{contentIdx + 1} / {CONTENT_STEPS.length}</span>
        </div>

        {/* Headline + body */}
        <div className="demo-card__body">
          <div className="demo-card__headline">
            {step.emoji && <span className="demo-card__emoji">{step.emoji}</span>}
            {step.headline}
          </div>
          {step.body && <p className="demo-card__desc">{step.body}</p>}
          {step.keyHint && <KeyHint label={step.keyHint} />}
          {step.interactHint && (
            <div className="demo-card__interact-hint">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 19l7-7-7-7M5 19l7-7-7-7"/>
              </svg>
              {step.interactHint}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="demo-card__footer">
          <button className="demo-card__skip" onClick={onDone}>Skip tour</button>
          <div className="demo-card__nav">
            {contentIdx > 0 && (
              <button className="demo-card__back" onClick={goBack} title="Back">←</button>
            )}
            <button className="demo-card__next" onClick={advance}>
              {step.ctaLabel ?? (stepIdx >= STEPS.length - 2 ? 'Finish' : 'Next →')}
            </button>
          </div>
        </div>
      </div>

      <div className="demo-tap-hint">click anywhere · or use the buttons</div>
    </>
  )
}
