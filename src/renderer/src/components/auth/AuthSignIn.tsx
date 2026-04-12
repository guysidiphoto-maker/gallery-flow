import React, { useState } from 'react'
import { AuthInput } from './AuthInput'
import { AuthGoogleButton } from './AuthGoogleButton'
import { signInWithEmail } from '../../lib/auth'

interface AuthSignInProps {
  onGoogleClick: () => void
  googleLoading: boolean
  googleError: string | null
  onSwitchToSignUp: () => void
}

export function AuthSignIn({ onGoogleClick, googleLoading, googleError, onSwitchToSignUp }: AuthSignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const { error: err } = await signInWithEmail(email.trim(), password)
    if (err) setError(err)
    setLoading(false)
    // Successful sign-in is handled by supabase.auth.onAuthStateChange in App.tsx.
  }

  const formError = error || googleError

  return (
    <div>
      {/* Header */}
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,.92)', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
        Welcome back
      </h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,.38)', margin: '0 0 28px', lineHeight: 1.5 }}>
        Sign in to continue managing your galleries
      </p>

      {/* Google */}
      <AuthGoogleButton onClick={onGoogleClick} loading={googleLoading} />

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AuthInput
          value={email}
          onChange={setEmail}
          placeholder="Email address"
          type="email"
          autoFocus
        />
        <AuthInput
          value={password}
          onChange={setPassword}
          placeholder="Password"
          type="password"
        />
        {formError && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '-2px 0 0 2px', lineHeight: 1.4 }}>
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !email || !password}
          style={{
            width: '100%',
            padding: '13px',
            background: loading ? 'rgba(99,102,241,.5)' : '#6366f1',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'background .15s, opacity .15s',
            opacity: (!email || !password) ? 0.5 : 1,
            marginTop: 4,
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {/* Footer */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', textAlign: 'center', margin: '20px 0 0' }}>
        Don't have an account?{' '}
        <button
          onClick={onSwitchToSignUp}
          style={{
            background: 'none',
            border: 'none',
            color: '#818cf8',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'none',
          }}
        >
          Create one
        </button>
      </p>
    </div>
  )
}
