import React from 'react'

interface ReadyScreenProps {
  businessName: string
  slug: string
  onEnter: () => void
}

export function ReadyScreen({ businessName, slug, onEnter }: ReadyScreenProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {/* Animated checkmark */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: 'rgba(16,185,129,.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          animation: 'onboarding-check-pop 0.4s ease',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 16l6 6L24 10"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 30,
              strokeDashoffset: 0,
              animation: 'onboarding-check-draw 0.5s ease 0.2s both',
            }}
          />
        </svg>
      </div>

      {/* Heading */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'rgba(255,255,255,.9)',
          marginBottom: 12,
        }}
      >
        You're all set!
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 14,
          color: 'rgba(255,255,255,.4)',
          marginBottom: 8,
        }}
      >
        Your galleries will be at:
      </div>

      {/* URL preview */}
      <div
        style={{
          fontSize: 13,
          color: '#6366f1',
          fontFamily: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace',
          marginBottom: 32,
        }}
      >
        pixflow.app/{slug}/gallery-name
      </div>

      {/* Enter button */}
      <button
        onClick={onEnter}
        style={{
          width: '100%',
          backgroundColor: '#6366f1',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          border: 'none',
          borderRadius: 10,
          padding: '16px 16px',
          cursor: 'pointer',
          transition: 'filter 0.15s ease',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
      >
        Start using Pixflow
      </button>

      <style>{`
        @keyframes onboarding-check-pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes onboarding-check-draw {
          0% { stroke-dashoffset: 30; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
