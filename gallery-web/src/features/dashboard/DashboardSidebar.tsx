import { signOut } from '@/shared/lib/auth'
import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'
import { RestartTourButton } from './tour/RestartTourButton'
import { TokenBalanceCard } from './TokenBalanceCard'
import type { DashboardView } from './types'

type OwnerT = ReturnType<typeof useOwnerLocale>['t']

interface NavItem {
  icon: IconName
  label: string
  view: DashboardView
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
  tokenBalance: number | null
  onBuyTokens: () => void
  avatar?: string
  displayName?: string
  ownerT: OwnerT
}) {
  const items: NavItem[] = [
    { icon: 'activity', label: ownerT('nav.overview'),  view: 'overview',  tour: 'overview' },
    { icon: 'gallery',  label: ownerT('nav.galleries'), view: 'galleries', tour: 'galleries' },
    { icon: 'search',   label: ownerT('nav.search'),    view: 'search',    tour: 'search' },
    { icon: 'palette',  label: ownerT('nav.brandKit'),  view: 'brand-kit', tour: undefined },
    { icon: 'clients',  label: ownerT('nav.clients'),   view: 'clients',   tour: 'clients' },
    { icon: 'download', label: ownerT('nav.import'),    view: 'import',    tour: 'import' },
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
        {/* Mobile close X, only shown in drawer mode. */}
        <button
          onClick={onClose}
          aria-label={ownerT('nav.closeMenu')}
          className="absolute end-3.5 top-3.5 hidden size-8 cursor-pointer items-center justify-center rounded-[8px] border border-line bg-black/3 p-0 text-ink max-[900px]:flex"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </button>

        <a href="/" className="flex items-baseline gap-1 px-1.5 pt-1 pb-8 text-[22px] font-medium tracking-[-0.02em] text-ink no-underline">
          <span>Pixflow</span>
          <span className="ms-1 size-[5px] -translate-y-px rounded-full bg-ink" />
        </a>

        <Eyebrow className="block px-3 pb-3 text-[10px] font-medium tracking-[0.06em]">{ownerT('nav.workspace')}</Eyebrow>
        <nav data-tour="overview" className="flex flex-1 flex-col gap-0.5">
          {/* In-page view switch: same shell, no navigation. */}
          {items.map(item => {
            const active = activeView === item.view
            return (
              <button
                key={item.view}
                {...(item.tour ? { 'data-tour': item.tour } : {})}
                onClick={() => onSelectView(item.view)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex cursor-pointer items-center gap-3 rounded-[4px] border-none bg-transparent px-3 py-[11px] text-start text-[13px] transition-colors duration-150 hover:text-ink',
                  active ? 'font-semibold text-ink' : 'font-normal text-ink-soft',
                )}
              >
                {active && (
                  <span className="absolute -end-5 top-1/2 h-[18px] w-0.5 -translate-y-1/2 bg-ink" />
                )}
                <Icon name={item.icon} size={16} strokeWidth={1.6} className={active ? 'opacity-100' : 'opacity-70'} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <Eyebrow className="block px-3 pt-5 pb-3 text-[10px] font-medium tracking-[0.06em]">{ownerT('nav.account')}</Eyebrow>
        <TokenBalanceCard tokenBalance={tokenBalance} onBuyTokens={onBuyTokens} ownerT={ownerT} />

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
            >{ownerT('nav.signOut')}</button>
          </div>
        </div>
      </aside>
    </>
  )
}
