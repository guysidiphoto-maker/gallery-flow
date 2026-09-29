import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { getProgress, saveProgress, resolveVisibility, clampStep } from './onboarding'
import { findTourTarget, measureTarget, type TargetRect } from './tourPlacement'
import type { TourStep } from './tourSteps'

// RestartTourButton dispatches this; a mounted FirstRunTour with the same
// surface reopens at step 0.
export const TOUR_RESTART_EVENT = 'pixflow:restart-tour'

// Tour state machine: visibility from stored progress, step navigation with
// per-step persistence, target measurement and keyboard handling.
export function useFirstRunTour({ enabled, steps, surface, dir }: {
  enabled: boolean
  steps: TourStep[]
  surface: string
  dir: 'rtl' | 'ltr'
}) {
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
      const el = findTourTarget(target)
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

  return { open, step, rect, isMobile, total, current, cardRef, dismiss, goTo, next, back, onKeyDown }
}
