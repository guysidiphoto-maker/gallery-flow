import React from 'react'

interface WelcomeScreenProps {
  onSignIn: () => void
  loading: boolean
  error?: string
}

const GOOGLE_ICON_SVG = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 10, flexShrink: 0 }}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export function WelcomeScreen({ onSignIn, loading, error }: WelcomeScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 9999,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        {/* Logo */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: 'rgba(255,255,255,.9)',
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}
        >
          Pixflow
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'rgba(255,255,255,.9)',
            marginBottom: 8,
          }}
        >
          Your photos, delivered beautifully.
        </div>

        {/* Subheadline */}
        <div
          style={{
            fontSize: 15,
            color: 'rgba(255,255,255,.4)',
            marginBottom: 32,
          }}
        >
          Professional gallery delivery for photographers.
        </div>

        {/* Sign in button */}
        <button
          onClick={onSignIn}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#6366f1',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            border: 'none',
            borderRadius: 10,
            padding: '14px 32px',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'filter 0.15s ease, opacity 0.15s ease',
            fontFamily: 'inherit',
            minWidth: 220,
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.currentTarget.style.filter = 'brightness(1.1)')
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)'
          }}
        >
          {loading ? (
            <div
              style={{
                width: 18,
                height: 18,
                border: '2px solid rgba(255,255,255,.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'onboarding-spin 0.6s linear infinite',
              }}
            />
          ) : (
            <>
              {GOOGLE_ICON_SVG}
              Continue with Google
            </>
          )}
        </button>

        {/* Error text */}
        {error && (
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes onboarding-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
