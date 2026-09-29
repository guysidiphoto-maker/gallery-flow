// App shell for the client portal: "<Client> — Client Portal by <Studio>" header
// with nav, locale toggle and account menu, then a centered content column.

import type { ReactNode } from 'react'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
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
  loc, studioName, clientTitle, navItems, activeNavId,
  showAccount, email, clientName, signingOut, onSignOut, children,
}: Props) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-[100] border-b border-line-soft bg-canvas px-[clamp(16px,4vw,32px)]">
        <div className="mx-auto flex min-h-[76px] max-w-[1160px] items-center justify-between gap-5 py-3 max-[761px]:flex-wrap max-[761px]:gap-y-3">
          {/* Client is primary; the studio is eyebrow context. */}
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium tracking-[0.2em] text-muted uppercase">
              <span className="truncate">
                {loc.t('portal.badge')}
                {studioName ? ` · ${loc.t('portal.by')} ${studioName}` : ''}
              </span>
            </div>
            <h1 className="max-w-[46vw] truncate font-serif text-[clamp(18px,2.4vw,22px)] leading-[1.1] font-medium tracking-[-0.01em] text-ink">
              {clientTitle}
            </h1>
          </div>

          <PortalNav loc={loc} items={navItems} activeId={activeNavId} />

          <div className="flex items-center gap-2.5">
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

      <main className="mx-auto max-w-[1160px] px-[clamp(16px,4vw,32px)] pt-[clamp(28px,5vw,56px)] pb-24">
        {children}
      </main>

      <footer className="border-t border-line-soft bg-canvas px-6 py-[22px] text-center">
        <div className="text-[10px] font-medium tracking-label text-muted uppercase">
          {loc.t('footer.poweredBy')}
        </div>
      </footer>
    </div>
  )
}
