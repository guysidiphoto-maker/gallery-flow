import React, { useState } from 'react'
import { AuthSignIn } from './AuthSignIn'
import { AuthSignUp } from './AuthSignUp'

type Mode = 'signin' | 'signup'

export function AuthCard() {
  const [mode, setMode] = useState<Mode>('signin')
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleClick = () => {
    setGoogleLoading(true)
    setTimeout(() => setGoogleLoading(false), 2000)
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: 400,
      background: 'rgba(255,255,255,.025)',
      border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 16,
      padding: '32px 32px 28px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,.4), 0 0 80px rgba(99,102,241,.04)',
    }}>
      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        background: 'rgba(255,255,255,.04)',
        borderRadius: 10,
        padding: 3,
        marginBottom: 28,
      }}>
        {(['signin', 'signup'] as Mode[]).map(m => {
          const active = mode === m
          const label = m === 'signin' ? 'Sign in' : 'Sign up'
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '9px 0',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : 'rgba(255,255,255,.35)',
                background: active ? 'rgba(99,102,241,.7)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .2s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Form content */}
      <div style={{ transition: 'opacity .15s' }}>
        {mode === 'signin' ? (
          <AuthSignIn
            onGoogleClick={handleGoogleClick}
            googleLoading={googleLoading}
            onSwitchToSignUp={() => setMode('signup')}
          />
        ) : (
          <AuthSignUp
            onGoogleClick={handleGoogleClick}
            googleLoading={googleLoading}
            onSwitchToSignIn={() => setMode('signin')}
          />
        )}
      </div>
    </div>
  )
}
