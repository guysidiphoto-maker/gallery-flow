// FirstRunTour: a lightweight, dependency-free spotlight tour for the OWNER
// dashboard (the business operator). Never rendered on client-portal routes;
// the integrator gates it with the `enabled` prop (see INTEGRATION.md).
//
// How it works:
//   • Each step points at a DOM node marked with data-tour="<target>". The
//     node is highlighted with a "spotlight" (a rounded box whose huge
//     box-shadow dims the rest of the page, zero libraries).
//   • A positioned card shows the step's title/body with Next/Back/Skip/Close,
//     step dots and a progress line. On phones it becomes a bottom sheet.
//   • Missing target → the card centers itself and the tour still progresses.
//   • Progress persists per step via src/lib/onboarding.ts (DB first,
//     localStorage fallback), so the tour resumes where the user left off and
//     re-appears after a TOUR_VERSION bump.
//   • Accessibility: role="dialog", aria-modal, aria-labelledby, focus trap
//     (reuses src/lib/useFocusTrap), Esc closes, ArrowRight/ArrowLeft/Enter
//     navigate (arrows flip in RTL), focus is restored on close.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOwnerLocale, type OwnerStringKey } from '../../lib/ownerLocale'
import { useFocusTrap } from '../../lib/useFocusTrap'
import {
  getProgress,
  saveProgress,
  resolveVisibility,
  clampStep,
} from '../../lib/onboarding'

export interface TourStep {
  id: string
  /** value of the data-tour attribute to highlight; omit to center the card */
  target?: string
  titleKey: OwnerStringKey
  bodyKey: OwnerStringKey
}

// Default steps for the owner dashboard. Targets are data-tour attribute
// values the integrator adds to the matching nav/actions (see INTEGRATION.md).
export const OWNER_TOUR_STEPS: TourStep[] = [
  { id: 'overview', target: 'overview', titleKey: 'tour.overview.title', bodyKey: 'tour.overview.body' },
  { id: 'clients', target: 'clients', titleKey: 'tour.clients.title', bodyKey: 'tour.clients.body' },
  { id: 'galleries', target: 'galleries', titleKey: 'tour.galleries.title', bodyKey: 'tour.galleries.body' },
  { id: 'assign', target: 'assign-gallery', titleKey: 'tour.assign.title', bodyKey: 'tour.assign.body' },
  { id: 'search', target: 'search', titleKey: 'tour.search.title', bodyKey: 'tour.search.body' },
  { id: 'import', target: 'import', titleKey: 'tour.import.title', bodyKey: 'tour.import.body' },
  { id: 'preview', target: 'client-preview', titleKey: 'tour.preview.title', bodyKey: 'tour.preview.body' },
]

// RestartTourButton dispatches this; a mounted FirstRunTour with the same
// surface reopens at step 0.
export const TOUR_RESTART_EVENT = 'pixflow:restart-tour'

export interface FirstRunTourProps {
  /** owner-only gate, supplied by the integrator; false → renders nothing */
  enabled: boolean
  steps?: TourStep[]
  surface?: string
}

interface TargetRect { top: number; left: number; width: number; height: number }

function measureTarget(target?: string): TargetRect | null {
  if (!target || typeof document === 'undefined') return null
  const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(target)
    : target.replace(/["\\]/g, '\\$&')
  const el = document.querySelector(`[data-tour="${esc}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

const Z_BASE = 12000
const CARD_WIDTH = 340
const SPOT_PAD = 6

export default function FirstRunTour({ enabled, steps = OWNER_TOUR_STEPS, surface = 'owner_tour' }: FirstRunTourProps) {
  const { t, dir } = useOwnerLocale()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<TargetRect | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const stepRef = useRef(step)
  stepRef.current = step

  const total = steps.length
  const current = steps[clampStep(step, total)]

  const dismiss = useCallback(() => {
    setOpen(false)
    void saveProgress(surface, { status: 'dismissed', step: stepRef.current })
  }, [surface])

  const finish = useCallback(() => {
    setOpen(false)
    void saveProgress(surface, { status: 'completed', step: total > 0 ? total - 1 : 0 })
  }, [surface, total])

  const goTo = useCallback((n: number) => {
    const next = clampStep(n, total)
    setStep(next)
    void saveProgress(surface, { status: 'in_progress', step: next })
  }, [surface, total])

  const next = useCallback(() => {
    if (stepRef.current >= total - 1) finish()
    else goTo(stepRef.current + 1)
  }, [finish, goTo, total])

  const back = useCallback(() => {
    if (stepRef.current > 0) goTo(stepRef.current - 1)
  }, [goTo])

  // Focus trap + Esc-to-close + focus restore (WCAG 2.1.2 / 2.4.3).
  const cardRef = useFocusTrap<HTMLDivElement>(open, dismiss)

  // Auto-show: only when enabled AND stored progress says pending/in_progress
  // (or the version was bumped). Resumes at the saved step.
  useEffect(() => {
    if (!enabled || total === 0) { setOpen(false); return }
    let cancelled = false
    void getProgress(surface).then(progress => {
      if (cancelled) return
      const v = resolveVisibility(progress)
      if (v.show) {
        setStep(clampStep(v.startStep, total))
        setOpen(true)
      }
    })
    return () => { cancelled = true }
  }, [enabled, surface, total])

  // Restart requests from <RestartTourButton />.
  useEffect(() => {
    if (!enabled) return
    function onRestart(e: Event) {
      const detail = (e as CustomEvent<{ surface?: string }>).detail
      if (detail?.surface && detail.surface !== surface) return
      setStep(0)
      setOpen(true)
      void saveProgress(surface, { status: 'in_progress', step: 0 })
    }
    window.addEventListener(TOUR_RESTART_EVENT, onRestart)
    return () => window.removeEventListener(TOUR_RESTART_EVENT, onRestart)
  }, [enabled, surface])

  // Measure the highlighted target; keep measuring on scroll/resize while open.
  useEffect(() => {
    if (!open) return
    const target = current?.target

    function update() {
      setRect(measureTarget(target))
      setIsMobile(window.innerWidth < 640)
    }

    // Bring the target into view first, then measure on the next frame.
    if (target) {
      const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(target)
        : target
      const el = document.querySelector(`[data-tour="${esc}"]`)
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* older browsers */ }
      }
    }
    update()
    const raf = requestAnimationFrame(update)
    const timer = window.setInterval(update, 350) // tracks smooth-scroll settling
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, step, current?.target])

  // Keyboard navigation on the dialog. Arrow keys flip in RTL so "forward"
  // always matches the visual reading direction. Enter advances unless a
  // button has focus (the button's own click already handles it).
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const forwardKey = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const backwardKey = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    if (e.key === forwardKey) { e.preventDefault(); next() }
    else if (e.key === backwardKey) { e.preventDefault(); back() }
    else if (e.key === 'Enter') {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); next() }
    }
  }, [dir, next, back])

  if (!enabled || !open || total === 0 || !current) return null

  const titleId = `pixflow-tour-title-${surface}`
  const bodyId = `pixflow-tour-body-${surface}`
  const isLast = step >= total - 1

  // ── Card placement ─────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: Z_BASE + 2,
    width: CARD_WIDTH,
    maxWidth: 'calc(100vw - 24px)',
    background: '#ffffff',
    color: '#0f172a',
    borderRadius: 14,
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.35)',
    padding: '18px 20px 16px',
    boxSizing: 'border-box',
  }
  if (isMobile) {
    // Bottom sheet on phones.
    Object.assign(cardStyle, {
      left: 12, right: 12, bottom: 12, width: 'auto',
      borderRadius: 16,
    })
  } else if (rect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const estCardHeight = 250
    const below = rect.top + rect.height + estCardHeight + 24 < vh
    if (below) cardStyle.top = Math.max(12, rect.top + rect.height + SPOT_PAD + 12)
    else cardStyle.bottom = Math.max(12, vh - rect.top + SPOT_PAD + 12)
    if (dir === 'rtl') {
      const fromRight = vw - (rect.left + rect.width)
      cardStyle.right = Math.min(Math.max(12, fromRight), Math.max(12, vw - CARD_WIDTH - 12))
    } else {
      cardStyle.left = Math.min(Math.max(12, rect.left), Math.max(12, vw - CARD_WIDTH - 12))
    }
  } else {
    // No target on this page → centered card, tour still progresses.
    Object.assign(cardStyle, {
      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    })
  }

  const btnBase: React.CSSProperties = {
    font: 'inherit', fontSize: 14, borderRadius: 10, cursor: 'pointer',
    padding: '8px 16px', border: '1px solid transparent',
  }
  const btnPrimary: React.CSSProperties = {
    ...btnBase, background: '#0f172a', color: '#ffffff', fontWeight: 600,
  }
  const btnGhost: React.CSSProperties = {
    ...btnBase, background: 'transparent', color: '#475569',
  }

  return (
    <>
      {/* Dim layer / spotlight. pointerEvents none on the spotlight itself so
          the dimming never eats clicks; the transparent catcher below keeps
          the dialog modal while Skip/Close/Esc always remain available. */}
      {rect && !isMobile ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 10,
            boxShadow: '0 0 0 200vmax rgba(15, 23, 42, 0.6)',
            zIndex: Z_BASE,
            pointerEvents: 'none',
            transition: 'top .25s ease, left .25s ease, width .25s ease, height .25s ease',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: Z_BASE,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Click catcher: swallows stray background clicks (no accidental page
          actions under the dim), never closes or advances anything. */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: Z_BASE + 1 }} />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        dir={dir}
        style={cardStyle}
        onKeyDown={onKeyDown}
      >
        {/* Header: progress + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            {t('tour.stepOf', { n: step + 1, total })}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('tour.close')}
            style={{ ...btnGhost, padding: '4px 8px', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <h2 id={titleId} style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
          {t(current.titleKey)}
        </h2>
        <p id={bodyId} style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: '#334155' }}>
          {t(current.bodyKey)}
        </p>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('tour.stepDot', { n: i + 1 })}
              aria-current={i === step ? 'step' : undefined}
              style={{
                width: i === step ? 18 : 8, height: 8, borderRadius: 999,
                border: 'none', padding: 0, cursor: 'pointer',
                background: i === step ? '#0f172a' : '#cbd5e1',
                transition: 'width .2s ease, background .2s ease',
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" onClick={dismiss} style={btnGhost}>
            {t('tour.skip')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button type="button" onClick={back} style={{ ...btnGhost, border: '1px solid #e2e8f0' }}>
                {t('tour.back')}
              </button>
            )}
            <button type="button" onClick={next} style={btnPrimary}>
              {isLast ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
