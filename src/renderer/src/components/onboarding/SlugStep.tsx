import React, { useState, useEffect, useRef } from 'react'
import { checkSlugAvailable } from '../../lib/auth'

interface SlugStepProps {
  businessName: string
  initialSlug: string
  onNext: (slug: string) => void
  onBack: () => void
}

export function SlugStep({ businessName, initialSlug, onNext, onBack }: SlugStepProps) {
  const [slug, setSlug] = useState(initialSlug)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!slug.trim()) {
      setAvailable(null)
      return
    }

    setChecking(true)
    setAvailable(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const isAvailable = await checkSlugAvailable(slug.trim())
      setAvailable(isAvailable)
      setChecking(false)
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug])

  const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')

  function handleSlugChange(value: string) {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(clean)
  }

  const canContinue = slug.trim() && available === true && !checking

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Heading */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'rgba(255,255,255,.9)',
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        Choose your public link
      </div>

      {/* Input with prefix */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            padding: '14px 0 14px 16px',
            fontSize: 15,
            color: 'rgba(255,255,255,.4)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            fontFamily: 'inherit',
          }}
        >
          pixflow.app/
        </span>
        <input
          type="text"
          value={slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canContinue) onNext(slug.trim())
          }}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            padding: '14px 16px 14px 0',
            fontSize: 15,
            color: 'rgba(255,255,255,.9)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        {/* Status indicator */}
        {slug.trim() && (
          <div style={{ paddingRight: 14, display: 'flex', alignItems: 'center' }}>
            {checking ? (
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,.2)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'onboarding-spin 0.6s linear infinite',
                }}
              />
            ) : available === true ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 9l3.5 3.5L14 5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : available === false ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 5l8 8M13 5l-8 8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : null}
          </div>
        )}
      </div>

      {/* Suggestions when taken */}
      {available === false && !checking && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
          Try:{' '}
          {[`${slug}-studio`, `${slug}-photo`].map((suggestion, i) => (
            <span key={suggestion}>
              {i > 0 && ', '}
              <span
                onClick={() => setSlug(suggestion)}
                style={{
                  color: '#6366f1',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                {suggestion}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={() => {
          if (canContinue) onNext(slug.trim())
        }}
        disabled={!canContinue}
        style={{
          marginTop: 28,
          width: '100%',
          backgroundColor: '#6366f1',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          borderRadius: 10,
          padding: '14px 16px',
          cursor: canContinue ? 'pointer' : 'default',
          opacity: canContinue ? 1 : 0.4,
          transition: 'opacity 0.15s ease, filter 0.15s ease',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          if (canContinue) e.currentTarget.style.filter = 'brightness(1.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'brightness(1)'
        }}
      >
        Continue
      </button>

      {/* Back link */}
      <div
        onClick={onBack}
        style={{
          marginTop: 16,
          fontSize: 13,
          color: 'rgba(255,255,255,.4)',
          cursor: 'pointer',
          textAlign: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.6)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
      >
        Back
      </div>

      <style>{`
        @keyframes onboarding-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
