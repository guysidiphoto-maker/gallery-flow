import React, { useState } from 'react'
import { AuthInput } from './AuthInput'
import { AuthGoogleButton } from './AuthGoogleButton'
import { signUpWithEmail } from '../../lib/auth'

interface AuthSignUpProps {
  onGoogleClick: () => void
  googleLoading: boolean
  googleError: string | null
  onSwitchToSignIn: () => void
}

export function AuthSignUp({ onGoogleClick, googleLoading, googleError, onSwitchToSignIn }: AuthSignUpProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const passwordsMatch = !password || !confirmPassword || password === confirmPassword
  const canSubmit = !!(name && email && password.length >= 6 && confirmPassword && passwordsMatch)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || loading) return
    setLoading(true)
    setError(null)
    setInfo(null)
    const { error: err } = await signUpWithEmail(email.trim(), password, name.trim())
    if (err) {
      setError(err)
    } else {
      setInfo('Account created. Check your email to confirm, then sign in.')
    }
    setLoading(false)
  }

  const formError = error || googleError

  return (
    <div>
      {/* Header */}
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,.92)', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
        Create your account
      </h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,.38)', margin: '0 0 28px', lineHeight: 1.5 }}>
        Start publishing galleries under your studio identity
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
          value={name}
          onChange={setName}
          placeholder="Full name"
          autoFocus
        />
        <AuthInput
          value={email}
          onChange={setEmail}
          placeholder="Email address"
          type="email"
        />
        <AuthInput
          value={password}
          onChange={setPassword}
          placeholder="Password (6+ characters)"
          type="password"
        />
        <AuthInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Confirm password"
          type="password"
        />
        {!passwordsMatch && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '-4px 0 0 2px' }}>Passwords don't match</p>
        )}
        {formError && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '-2px 0 0 2px', lineHeight: 1.4 }}>
            {formError}
          </p>
        )}
        {info && (
          <p style={{ fontSize: 12, color: '#6ee7b7', margin: '-2px 0 0 2px', lineHeight: 1.4 }}>
            {info}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !canSubmit}
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
            opacity: !canSubmit ? 0.5 : 1,
            marginTop: 4,
          }}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      {/* Footer */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', textAlign: 'center', margin: '20px 0 0' }}>
        Already have an account?{' '}
        <button
          onClick={onSwitchToSignIn}
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
          Sign in
        </button>
      </p>
    </div>
  )
}
