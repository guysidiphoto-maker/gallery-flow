import React, { useEffect, useRef, useState } from 'react'
import { useDemo } from '../store/demo'

export function DemoOverlay() {
  const { phase, step, progress, stopDemo } = useDemo()
  const [displayedStep, setDisplayedStep] = useState(step)
  const [stepVisible, setStepVisible] = useState(true)
  const prevStep = useRef(step)

  // Fade step text when it changes
  useEffect(() => {
    if (step === prevStep.current) return
    prevStep.current = step
    setStepVisible(false)
    const t = setTimeout(() => {
      setDisplayedStep(step)
      setStepVisible(true)
    }, 220)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (phase !== 'idle') setDisplayedStep(step)
  }, [phase])

  if (phase === 'idle') return null

  const isCurtain = phase === 'intro' || phase === 'done'

  return (
    <>
      {/* Full-screen click blocker (transparent during running, dark during curtain) */}
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

      {/* UI chrome — only during running */}
      {phase === 'running' && (
        <>
          {/* Amber progress bar at top */}
          <div className="demo-progress-track">
            <div
              className="demo-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* DEMO badge */}
          <div className="demo-badge">DEMO</div>

          {/* Bottom caption strip */}
          <div className="demo-caption">
            <span
              className={`demo-caption__text${stepVisible ? ' demo-caption__text--visible' : ''}`}
            >
              {displayedStep}
            </span>
            <button className="demo-stop" onClick={stopDemo}>
              Stop
            </button>
          </div>
        </>
      )}
    </>
  )
}
