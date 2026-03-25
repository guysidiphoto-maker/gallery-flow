import React, { useEffect, useRef, useState } from 'react'
import { useDemo } from '../store/demo'

export function DemoOverlay() {
  const { phase, step, progress, titleCard, stopDemo } = useDemo()

  // ── Step caption fade ────────────────────────────────────────────────────────
  const [displayedStep, setDisplayedStep] = useState(step)
  const [stepVisible, setStepVisible] = useState(true)
  const prevStep = useRef(step)

  useEffect(() => {
    if (step === prevStep.current) return
    prevStep.current = step
    setStepVisible(false)
    const t = setTimeout(() => {
      setDisplayedStep(step)
      setStepVisible(true)
    }, 200)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (phase !== 'idle') setDisplayedStep(step)
  }, [phase])

  // ── Title card fade ──────────────────────────────────────────────────────────
  // Keep the content rendered for 280ms after titleCard is cleared so the
  // CSS fade-out can complete before the element is removed from the DOM.
  const [cardContent, setCardContent] = useState<string | null>(null)
  const [cardVisible, setCardVisible] = useState(false)

  useEffect(() => {
    if (titleCard) {
      setCardContent(titleCard)
      // Double-rAF ensures the element is painted before the transition fires
      requestAnimationFrame(() => requestAnimationFrame(() => setCardVisible(true)))
    } else {
      setCardVisible(false)
      const t = setTimeout(() => setCardContent(null), 300)
      return () => clearTimeout(t)
    }
  }, [titleCard])

  if (phase === 'idle') return null

  const isCurtain = phase === 'intro' || phase === 'done'

  return (
    <>
      {/* Full-screen click blocker */}
      <div className={`demo-blocker${isCurtain ? ' demo-blocker--curtain' : ''}`}>
        {isCurtain && (
          <div className="demo-curtain">
            <div className="demo-curtain__logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div className="demo-curtain__title">GalleryFlow</div>
            {phase === 'done' && (
              <div className="demo-curtain__subtitle">Your photos, beautifully organized.</div>
            )}
          </div>
        )}
      </div>

      {/* Full-screen title card (between steps) */}
      {cardContent && (
        <div className={`demo-title-card${cardVisible ? ' demo-title-card--visible' : ''}`}>
          <p className="demo-title-card__text">{cardContent}</p>
        </div>
      )}

      {/* Running HUD */}
      {phase === 'running' && (
        <>
          <div className="demo-progress-track">
            <div className="demo-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="demo-badge">DEMO</div>

          <div className="demo-caption">
            <span className={`demo-caption__text${stepVisible ? ' demo-caption__text--visible' : ''}`}>
              {displayedStep}
            </span>
            <button className="demo-stop" onClick={stopDemo}>Stop</button>
          </div>
        </>
      )}
    </>
  )
}
