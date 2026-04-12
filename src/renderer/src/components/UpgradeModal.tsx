import React from 'react'

interface UpgradeModalProps {
  planName: string
  violations: string[]
  onUpgrade: () => void
  onClose: () => void
}

export function UpgradeModal({ planName, violations, onUpgrade, onClose }: UpgradeModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, background: '#111118',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 16, padding: '36px 32px', textAlign: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,.6)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'rgba(99,102,241,.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 20, fontWeight: 700, color: '#fff',
          margin: '0 0 8px', letterSpacing: '-0.3px',
        }}>
          Upgrade to continue
        </h2>

        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,.45)',
          margin: '0 0 20px', lineHeight: 1.6,
        }}>
          Your <span style={{ color: '#a5b4fc', fontWeight: 600 }}>{planName}</span> plan
          has reached its limit:
        </p>

        {/* Violations */}
        <div style={{
          background: 'rgba(239,68,68,.06)',
          border: '1px solid rgba(239,68,68,.15)',
          borderRadius: 10, padding: '12px 16px',
          marginBottom: 24, textAlign: 'left',
        }}>
          {violations.map((v, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 0', fontSize: 13, color: 'rgba(255,255,255,.7)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {v}
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onUpgrade}
          style={{
            width: '100%', padding: '14px 20px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 15, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            transition: 'opacity .15s',
            boxShadow: '0 4px 20px rgba(99,102,241,.3)',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          View Plans & Upgrade
        </button>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px 20px', marginTop: 10,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,.4)', fontSize: 13,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
