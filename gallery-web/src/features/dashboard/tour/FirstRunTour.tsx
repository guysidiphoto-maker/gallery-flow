// Dependency-free spotlight tour for the owner dashboard: highlights
// [data-tour] targets, persists progress per step (DB, localStorage fallback),
// becomes a bottom sheet on phones and is a focus-trapped, keyboard-navigable dialog.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOwnerLocale, type OwnerStringKey } from '@/shared/i18n/ownerLocale'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { cn } from '@/shared/ui'
import {
  getProgress,
  saveProgress,
  resolveVisibility,
  clampStep,
} from './onboarding'

export interface TourStep {
  id: string
  /** value of the data-tour attribute to highlight; omit to center the card */
  target?: string
  titleKey: OwnerStringKey
  bodyKey: OwnerStringKey
}

// Default steps for the owner dashboard. Targets are data-tour attribute
// values the integrator adds to the matching nav/actions (see INTEGRATION.md).
const OWNER_TOUR_STEPS: TourStep[] = [
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

// Keep in sync with the card's w-[340px].
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

  // ── Card placement: only the anchored offsets are computed at runtime ──
  const placement: React.CSSProperties = {}
  if (!isMobile && rect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const estCardHeight = 250
    const below = rect.top + rect.height + estCardHeight + 24 < vh
    if (below) placement.top = Math.max(12, rect.top + rect.height + SPOT_PAD + 12)
    else placement.bottom = Math.max(12, vh - rect.top + SPOT_PAD + 12)
    if (dir === 'rtl') {
      const fromRight = vw - (rect.left + rect.width)
      placement.right = Math.min(Math.max(12, fromRight), Math.max(12, vw - CARD_WIDTH - 12))
    } else {
      placement.left = Math.min(Math.max(12, rect.left), Math.max(12, vw - CARD_WIDTH - 12))
    }
  }

  const btnBase = 'cursor-pointer rounded-md border border-transparent px-4 py-2 text-sm'
  const btnPrimary = cn(btnBase, 'bg-ink font-semibold text-white')
  const btnGhost = cn(btnBase, 'bg-transparent text-ink-soft')

  return (
    <>
      {/* Dim layer / spotlight. pointerEvents none on the spotlight itself so
          the dimming never eats clicks; the transparent catcher below keeps
          the dialog modal while Skip/Close/Esc always remain available. */}
      {rect && !isMobile ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[12000] rounded-md shadow-[0_0_0_200vmax] shadow-ink/60 transition-[top,left,width,height] duration-250 ease-[ease]"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
          }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12000] bg-ink/60" />
      )}
      {/* Click catcher: swallows stray background clicks (no accidental page
          actions under the dim), never closes or advances anything. */}
      <div aria-hidden="true" className="fixed inset-0 z-[12001]" />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        dir={dir}
        className={cn(
          'fixed z-[12002] box-border w-[340px] max-w-[calc(100vw-24px)] rounded-[14px] bg-raised px-5 pt-[18px] pb-4 text-ink',
          'shadow-[0_18px_48px] shadow-ink/35',
          // Phones: bottom sheet. No target: centered card, tour still progresses.
          isMobile ? 'right-3 bottom-3 left-3 w-auto rounded-lg'
            : !rect && 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        style={placement}
        onKeyDown={onKeyDown}
      >
        {/* Header: progress + close */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate">
            {t('tour.stepOf', { n: step + 1, total })}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('tour.close')}
            className={cn(btnGhost, 'px-2 py-1 text-base leading-none')}
          >
            ×
          </button>
        </div>

        <h2 id={titleId} className="mb-1.5 text-[17px] leading-[1.3] font-bold">
          {t(current.titleKey)}
        </h2>
        <p id={bodyId} className="mb-3.5 text-sm leading-[1.55] text-ink-soft">
          {t(current.bodyKey)}
        </p>

        {/* Step dots */}
        <div className="mb-3.5 flex justify-center gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('tour.stepDot', { n: i + 1 })}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'h-2 cursor-pointer rounded-full border-none p-0 transition-[width,background-color] duration-200 ease-[ease]',
                i === step ? 'w-[18px] bg-ink' : 'w-2 bg-line',
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={dismiss} className={btnGhost}>
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={back} className={cn(btnGhost, 'border-line-soft')}>
                {t('tour.back')}
              </button>
            )}
            <button type="button" onClick={next} className={btnPrimary}>
              {isLast ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
