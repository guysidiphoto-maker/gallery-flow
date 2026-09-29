import { signOut } from '@/shared/lib/auth'
import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Icon, type IconName } from '@/shared/ui/Icon'
import RestartTourButton from './tour/RestartTourButton'
import { TokenBalanceCard } from './TokenBalanceCard'
import { bg, border, textMuted, textPrimary, textSecondary } from './styles'
import type { DashboardView } from './types'

type OwnerT = ReturnType<typeof useOwnerLocale>['t']

interface NavItem {
  icon: IconName
  label: string
  active: boolean
  href: string | undefined
  view: DashboardView | undefined
  tour: string | undefined
}

// Sticky 240px column; below 900px an off-canvas drawer (see styles.ts).
export function DashboardSidebar({
  open, onClose, activeView, onSelectView, tokenBalance, onBuyTokens, avatar, displayName, ownerT,
}: {
  open: boolean
  onClose: () => void
  activeView: DashboardView
  onSelectView: (v: DashboardView) => void
  tokenBalance: number
  onBuyTokens: () => void
  avatar?: string
  displayName?: string
  ownerT: OwnerT
}) {
  const items: NavItem[] = [
    { icon: 'activity', label: ownerT('nav.overview'),  active: activeView === 'overview', href: undefined, view: 'overview', tour: 'overview' },
    { icon: 'gallery',  label: ownerT('nav.galleries'), active: activeView === 'galleries', href: undefined, view: 'galleries', tour: 'galleries' },
    { icon: 'search',   label: ownerT('nav.search'),    active: activeView === 'search', href: undefined, view: 'search', tour: 'search' },
    { icon: 'palette',  label: 'Brand Kit',             active: false, href: '/brand-kit', view: undefined, tour: undefined },
    { icon: 'clients',  label: ownerT('nav.clients'),   active: activeView === 'clients', href: undefined, view: 'clients', tour: 'clients' },
    { icon: 'download', label: ownerT('nav.import'),    active: activeView === 'import', href: undefined, view: 'import', tour: 'import' },
  ]

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 199,
            background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)',
            display: 'none',
          }}
          className="dash-sidebar-backdrop"
        />
      )}

      <aside
        className={`dash-sidebar ${open ? 'dash-sidebar--open' : ''}`}
        style={{
          width: 240, flexShrink: 0,
          background: bg,
          borderInlineStart: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
          padding: '28px 20px',
          position: 'sticky', top: 0, height: '100vh',
          zIndex: 200,
        }}
      >
        {/* Mobile close X — shown only via the .dash-hamburger media query */}
        <button
          onClick={onClose}
          className="dash-hamburger"
          aria-label="Close menu"
          style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            position: 'absolute', top: 14, left: 14,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0,0,0,.03)',
            border: `1px solid ${border}`,
            color: textPrimary, cursor: 'pointer', padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <a href="/" style={{
          display: 'flex', alignItems: 'baseline', gap: 4,
          padding: '4px 6px 32px',
          textDecoration: 'none', color: textPrimary,
          fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em',
        }}>
          <span>Pixflow</span>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: textPrimary, marginInlineStart: 4,
            transform: 'translateY(-1px)',
          }} />
        </a>

        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
          padding: '0 12px 12px',
        }}>
          Workspace
        </div>
        <nav data-tour="overview" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {items.map(item => (
            <button
              key={item.label}
              {...(item.tour ? { 'data-tour': item.tour } : {})}
              onClick={() => {
                if (item.view) {
                  // In-page view switch — same shell, no navigation.
                  onSelectView(item.view)
                  return
                }
                if (!item.href) return
                window.location.pathname = item.href
              }}
              style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 12px', borderRadius: 4,
              background: 'transparent',
              border: 'none',
              color: item.active ? textPrimary : textSecondary,
              fontSize: 13, fontWeight: item.active ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'right' as const,
              opacity: 1,
              transition: 'color .15s',
              position: 'relative',
            }}>
              {item.active && (
                <span style={{
                  position: 'absolute', insetInlineEnd: -20, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 2, height: 18,
                  background: textPrimary,
                }} />
              )}
              <Icon name={item.icon} size={16} strokeWidth={1.6} style={{ opacity: item.active ? 1 : 0.7 }} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
          padding: '20px 12px 12px',
        }}>
          Account
        </div>
        <TokenBalanceCard tokenBalance={tokenBalance} onBuyTokens={onBuyTokens} />

        <RestartTourButton
          surface="owner_tour"
          className="dash-restart-tour"
          style={{
            background: 'none', border: 'none', padding: '2px 4px 14px',
            fontFamily: 'inherit', fontSize: 11, color: textMuted,
            cursor: 'pointer', textAlign: 'start', letterSpacing: '0.02em',
          }}
        />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 8px', borderTop: `1px solid ${border}`,
          marginInline: -6, paddingInline: 14,
        }}>
          {avatar && (
            <img src={avatar} alt="" style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `1.5px solid ${border}`,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: textPrimary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <button onClick={signOut} style={{
              background: 'none', border: 'none', padding: 0, marginTop: 2,
              fontSize: 10, color: '#fca5a5', fontFamily: 'inherit',
              cursor: 'pointer', letterSpacing: '.04em',
            }}>התנתקות ↩</button>
          </div>
        </div>
      </aside>
    </>
  )
}
