// SocialComingSoon — the locked-state panel for the Social Studio while the
// feature flag (VITE_FEATURE_SOCIAL_STUDIO, contract C1) is off. Rendered by
// ClientDashboard when the locked nav item is selected. Pure presentation:
// no data fetching, no Instagram connect, no partially working screens.
//
// The lock glyph is an inline SVG because the shared Icon set has no 'lock'
// name and Icon.tsx is not owned by the social-lock area (see INTEGRATION.md).

import type { PortalLocale } from '../../lib/portalLocale'

const border      = '#D0D0D0'
const bgSubtle    = '#FAF9F5'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted   = '#767470'

function LockGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

interface Props {
  loc: PortalLocale
  onGoGalleries: () => void
}

export default function SocialComingSoon({ loc, onGoGalleries }: Props) {
  return (
    <div dir={loc.dir} style={{
      maxWidth: 520, margin: '48px auto', textAlign: 'center',
      background: '#fff', border: `1px solid ${border}`,
      padding: '56px 44px',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: bgSubtle, border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: textPrimary, margin: '0 auto 22px',
      }}>
        <LockGlyph />
      </div>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 14,
      }}>{loc.t('nav.comingSoon')}</div>
      <h2 style={{
        fontSize: 24, fontWeight: 500, margin: '0 0 12px',
        letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.2,
      }}>{loc.t('socialLock.title')}</h2>
      <p style={{
        fontSize: 14, color: textSecondary, margin: '0 0 30px', lineHeight: 1.6,
      }}>{loc.t('socialLock.body')}</p>
      <button
        type="button"
        onClick={onGoGalleries}
        style={{
          padding: '11px 24px', borderRadius: 2,
          background: 'transparent', border: `1px solid ${textPrimary}`,
          color: textPrimary, fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background .15s, color .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
      >
        {loc.t('socialLock.cta')}
      </button>
    </div>
  )
}
