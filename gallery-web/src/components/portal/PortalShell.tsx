// PortalShell — the premium app shell for the client portal.
//
// Communicates the production-company ↔ client relationship in the header:
// "<Client> — Client Portal by <Studio>". Houses the primary nav, the locale
// toggle and the integrated account menu, then renders the active screen inside
// a centered content column with a quiet Pixflow footer.

import type { ReactNode } from 'react'
import type { PortalLocale } from '../../lib/portalLocale'
import { tokens, serifDisplay, focusVisible } from './tokens'
import { skeletonKeyframes } from './Skeleton'
import { PortalNav, type NavItem } from './PortalNav'
import { AccountMenu } from './AccountMenu'
import { LocaleToggle } from './LocaleToggle'

interface Props {
  loc: PortalLocale
  studioName: string
  clientTitle: string
  navItems: NavItem[]
  activeNavId: string
  showAccount: boolean
  email: string | null
  clientName: string | null
  signingOut: boolean
  onSignOut: () => void
  children: ReactNode
}

export function PortalShell({
  loc,
  studioName,
  clientTitle,
  navItems,
  activeNavId,
  showAccount,
  email,
  clientName,
  signingOut,
  onSignOut,
  children,
}: Props) {
  return (
    <div style={{ minHeight: '100vh', background: tokens.bg, color: tokens.textPrimary, fontFamily: 'inherit' }}>
      <style>{`
        ${focusVisible}
        ${skeletonKeyframes}
        @media (max-width: 760px) {
          .pf-nav-inline { display: none !important; }
          .pf-nav-collapsed { display: block !important; }
          .pf-header-row { flex-wrap: wrap; row-gap: 12px; }
        }
        @media (max-width: 640px) {
          .pf-feature-split { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bg,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0 clamp(16px, 4vw, 32px)',
        }}
      >
        <div
          className="pf-header-row"
          style={{
            maxWidth: 1160,
            margin: '0 auto',
            minHeight: 76,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            paddingBlock: 12,
          }}
        >
          {/* Identity — client is primary, studio is the eyebrow context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: tokens.textMuted, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {loc.t('portal.badge')}
                {studioName ? ` · ${loc.t('portal.by')} ${studioName}` : ''}
              </span>
            </div>
            <h1
              style={{
                ...serifDisplay,
                fontSize: 'clamp(18px, 2.4vw, 22px)',
                margin: 0,
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '46vw',
              }}
            >
              {clientTitle}
            </h1>
          </div>

          {/* Nav */}
          <PortalNav loc={loc} items={navItems} activeId={activeNavId} />

          {/* Right cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LocaleToggle loc={loc} />
            {showAccount && (
              <AccountMenu
                loc={loc}
                email={email}
                clientName={clientName}
                signingOut={signingOut}
                onSignOut={onSignOut}
              />
            )}
          </div>
        </div>
      </header>

      {/* Content column */}
      <main style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(16px, 4vw, 32px) 96px' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${tokens.border}`, padding: '22px 24px', textAlign: 'center', background: tokens.bg }}>
        <div style={{ fontSize: 10, color: tokens.textMuted, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          {loc.t('footer.poweredBy')}
        </div>
      </footer>
    </div>
  )
}
