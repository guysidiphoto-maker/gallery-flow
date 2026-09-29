import { signOut } from '@/shared/lib/auth'
import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'
import RestartTourButton from './tour/RestartTourButton'
import { TokenBalanceCard } from './TokenBalanceCard'
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

// Sticky 240px column; below 900px an off-canvas drawer from the inline end.
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
          className="fixed inset-0 z-[199] hidden bg-black/65 backdrop-blur-[4px] max-[900px]:block"
        />
      )}

      <aside
        className={cn(
          'sticky top-0 z-[200] flex h-screen w-60 shrink-0 flex-col border-s border-line bg-canvas px-5 py-7',
          'max-[900px]:fixed max-[900px]:end-0 max-[900px]:shadow-[-8px_0_32px] max-[900px]:shadow-black/40',
          'max-[900px]:transition-transform max-[900px]:duration-250 max-[900px]:ease-in-out',
          open ? 'max-[900px]:translate-x-0' : 'max-[900px]:translate-x-full max-[900px]:rtl:-translate-x-full',
        )}
      >
        {/* Mobile close X — only shown in drawer mode. */}
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="absolute top-3.5 left-3.5 hidden size-8 cursor-pointer items-center justify-center rounded-[8px] border border-line bg-black/3 p-0 text-ink max-[900px]:flex"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <a href="/" className="flex items-baseline gap-1 px-1.5 pt-1 pb-8 text-[22px] font-medium tracking-[-0.02em] text-ink no-underline">
          <span>Pixflow</span>
          <span className="ms-1 size-[5px] -translate-y-px rounded-full bg-ink" />
        </a>

        <Eyebrow className="block px-3 pb-3 text-[9px] font-medium">Workspace</Eyebrow>
        <nav data-tour="overview" className="flex flex-1 flex-col gap-0.5">
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
              className={cn(
                'relative flex cursor-pointer items-center gap-3 rounded-[4px] border-none bg-transparent px-3 py-[11px] text-right text-[13px] transition-colors duration-150',
                item.active ? 'font-semibold text-ink' : 'font-normal text-ink-soft',
              )}
            >
              {item.active && (
                <span className="absolute -end-5 top-1/2 h-[18px] w-0.5 -translate-y-1/2 bg-ink" />
              )}
              <Icon name={item.icon} size={16} strokeWidth={1.6} className={item.active ? 'opacity-100' : 'opacity-70'} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <Eyebrow className="block px-3 pt-5 pb-3 text-[9px] font-medium">Account</Eyebrow>
        <TokenBalanceCard tokenBalance={tokenBalance} onBuyTokens={onBuyTokens} />

        <RestartTourButton
          surface="owner_tour"
          className="cursor-pointer border-none bg-transparent px-1 pt-0.5 pb-3.5 text-start text-[11px] tracking-[0.02em] text-muted"
        />

        <div className="-mx-1.5 flex items-center gap-2.5 border-t border-line px-3.5 py-3">
          {avatar && (
            <img src={avatar} alt="" className="size-8 rounded-full border-[1.5px] border-line" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink">{displayName}</div>
            <button
              onClick={signOut}
              className="mt-0.5 cursor-pointer border-none bg-transparent p-0 text-[10px] tracking-[.04em] text-danger"
            >התנתקות ↩</button>
          </div>
        </div>
      </aside>
    </>
  )
}
