import React from 'react'
import { AuthCard } from './AuthCard'

export function AuthShell() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(99,102,241,.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Draggable title bar region */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 38,
        WebkitAppRegion: 'drag' as unknown as string,
      } as React.CSSProperties} />

      {/* Logo */}
      <div style={{
        marginBottom: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#6366f1" fillOpacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
          <circle cx="12" cy="10" r="3" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M6 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        <span style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'rgba(255,255,255,.9)',
        }}>
          Pixflow
        </span>
      </div>

      {/* Auth card */}
      <AuthCard />

      {/* Trust line */}
      <p style={{
        marginTop: 32,
        fontSize: 12,
        color: 'rgba(255,255,255,.18)',
        textAlign: 'center',
        maxWidth: 340,
        lineHeight: 1.6,
        position: 'relative',
      }}>
        Cloud publishing, branded gallery links, and client delivery in one place.
      </p>
    </div>
  )
}
