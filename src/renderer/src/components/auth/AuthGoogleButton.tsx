import React, { useState } from 'react'

interface AuthGoogleButtonProps {
  onClick: () => void
  loading?: boolean
}

export function AuthGoogleButton({ onClick, loading }: AuthGoogleButtonProps) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '13px 20px',
        background: hovered
          ? pressed ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.09)'
          : 'rgba(255,255,255,.06)',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'background .15s, transform .1s',
        transform: pressed ? 'scale(0.985)' : 'none',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <div style={{
          width: 18,
          height: 18,
          border: '2px solid rgba(255,255,255,.15)',
          borderTopColor: 'rgba(255,255,255,.6)',
          borderRadius: '50%',
          animation: 'spin .6s linear infinite',
        }} />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )}
      {loading ? 'Connecting...' : 'Continue with Google'}
    </button>
  )
}
