// Primary portal nav. Inline on wide screens; at <=760px it collapses behind a
// labelled "Menu" dropdown (pure CSS switch, no viewport measurement).

import { useState } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { useDismiss } from '@/shared/lib/useDismiss'
import { focusRing } from '../lib/focusRing'

export interface NavItem {
  id: string
  label: string
  icon: IconName
  onSelect: () => void
}

interface Props {
  loc: PortalLocale
  items: NavItem[]
  activeId: string
}

export function PortalNav({ loc, items, activeId }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(menuOpen, () => setMenuOpen(false))
  const activeItem = items.find(i => i.id === activeId)

  return (
    <>
      <nav aria-label={loc.t('nav.menu')} className="flex items-center gap-1 max-[761px]:hidden">
        {items.map(item => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={item.onSelect}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-[9px] text-xs font-medium tracking-[0.02em] whitespace-nowrap',
                'transition-colors duration-150',
                active ? 'bg-ink text-white' : 'bg-transparent text-ink-soft',
                focusRing,
              )}
            >
              <Icon name={item.icon} size={14} strokeWidth={1.65} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div ref={ref} className="relative hidden max-[761px]:block">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={loc.t('nav.menu')}
          onClick={() => setMenuOpen(o => !o)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border border-line-soft bg-white px-3.5 py-[9px] text-xs font-medium text-ink',
            focusRing,
          )}
        >
          <Icon name="menu" size={15} strokeWidth={1.75} />
          {activeItem ? activeItem.label : loc.t('nav.menu')}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute start-0 top-full z-[300] mt-2 min-w-[220px] overflow-hidden rounded-sm border border-line-soft bg-white shadow-card"
          >
            {items.map(item => {
              const active = item.id === activeId
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { item.onSelect(); setMenuOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-2.5 border-b border-line-soft px-4 py-3 text-start text-[13px] font-medium text-ink',
                    active ? 'bg-surface' : 'bg-transparent',
                    focusRing,
                  )}
                >
                  <Icon name={item.icon} size={15} strokeWidth={1.65} />
                  {item.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
