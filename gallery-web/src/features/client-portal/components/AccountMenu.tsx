// Account control integrated in the portal header: signed-in email, client name
// and a single Logout action.

import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { useDismiss } from '@/shared/lib/useDismiss'
import { focusRing } from '../lib/focusRing'

interface Props {
  loc: PortalLocale
  email: string | null
  clientName: string | null
  signingOut: boolean
  onSignOut: () => void
}

export function AccountMenu({ loc, email, clientName, signingOut, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const avatarInitial = (clientName || email || '?').trim().charAt(0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={loc.t('account.title')}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border py-[7px] ps-2 pe-3 text-xs font-medium whitespace-nowrap transition-colors duration-150',
          open ? 'border-ink bg-ink text-white' : 'border-line-soft bg-white text-ink',
          focusRing,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold uppercase',
            open ? 'border-white/40 bg-white/18' : 'border-line-soft bg-surface',
          )}
        >
          {avatarInitial}
        </span>
        <span className="max-w-[120px] overflow-hidden text-ellipsis">{loc.t('account.button')}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-[300] mt-2 min-w-[240px] overflow-hidden rounded-sm border border-line-soft bg-white shadow-card"
        >
          <div className="border-b border-line-soft bg-surface px-4 py-3.5">
            <div className="mb-1.5 text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
              {loc.t('account.signedInAs')}
            </div>
            <div dir="ltr" className={cn('truncate text-[13px] text-ink', loc.dir === 'rtl' ? 'text-right' : 'text-left')}>
              {email ?? '—'}
            </div>
            {clientName && (
              <div className="mt-1 text-xs text-muted">
                {loc.t('account.client')}: {clientName}
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            disabled={signingOut}
            className={cn(
              'flex w-full items-center gap-2.5 bg-transparent px-4 py-[13px] text-start text-[13px] font-medium text-ink',
              'disabled:cursor-not-allowed disabled:opacity-60',
              focusRing,
            )}
          >
            <Icon name="logout" size={15} strokeWidth={1.75} />
            {signingOut ? loc.t('account.loggingOut') : loc.t('account.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
