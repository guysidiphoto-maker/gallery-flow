// Dependency-free spotlight tour for the owner dashboard: highlights
// [data-tour] targets, persists progress per step (DB, localStorage fallback),
// becomes a bottom sheet on phones and is a focus-trapped, keyboard-navigable dialog.

import type { CSSProperties } from 'react'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { cn } from '@/shared/ui'
import { OWNER_TOUR_STEPS, type TourStep } from './tourSteps'
import { SPOT_PAD, cardPlacement } from './tourPlacement'
import { useFirstRunTour } from './useFirstRunTour'

export interface FirstRunTourProps {
  /** owner-only gate; false renders nothing */
  enabled: boolean
  steps?: TourStep[]
  surface?: string
}

export default function FirstRunTour({ enabled, steps = OWNER_TOUR_STEPS, surface = 'owner_tour' }: FirstRunTourProps) {
  const { t, dir } = useOwnerLocale()
  const {
    open, step, rect, isMobile, total, current, cardRef, dismiss, goTo, next, back, onKeyDown,
  } = useFirstRunTour({ enabled, steps, surface, dir })

  if (!enabled || !open || total === 0 || !current) return null

  const titleId = `pixflow-tour-title-${surface}`
  const bodyId = `pixflow-tour-body-${surface}`
  const isLast = step >= total - 1

  const placement: CSSProperties = cardPlacement(rect, isMobile, dir)

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
