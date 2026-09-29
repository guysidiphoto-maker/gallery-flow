import { signInWithGoogle } from '@/shared/lib/auth'
import { bg, border, textMuted, textPrimary, textSecondary } from './styles'

// Editorial sign-in: tracked wordmark, hairline rule, outlined CTA that inverts on hover.
export function SignInScreen() {
  return (
    <div style={{
      background: bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', direction: 'rtl', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: textMuted, marginBottom: 28,
        }}>
          Pixflow
        </div>
        <div style={{ width: 28, height: 1, background: border, margin: '0 auto 28px' }} />
        <h1 style={{
          fontFamily: 'inherit', fontSize: 28, fontWeight: 400,
          color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.2,
          margin: '0 0 14px',
        }}>
          כניסה לחשבון
        </h1>
        <p style={{
          fontSize: 13, color: textSecondary, lineHeight: 1.6,
          margin: '0 0 40px',
        }}>
          ניהול הגלריות, פרסום ושיתוף עם הלקוחות.
        </p>
        <button
          onClick={signInWithGoogle}
          onMouseEnter={(e) => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'transparent', color: textPrimary,
            border: `1px solid ${textPrimary}`, borderRadius: 2,
            padding: '14px 30px', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            transition: 'background .15s, color .15s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
            <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
          </svg>
          התחברות עם Google
        </button>
      </div>
    </div>
  )
}
