// PortalNav — the primary portal navigation. Every item has a real text label
// (no unexplained icon-only controls). Active item uses aria-current="page".
//
// Responsive: on wide viewports the items render inline. On narrow viewports
// (<=760px) they collapse behind an accessible "Menu" button that opens a
// labelled dropdown. The collapse is driven by a CSS media query toggling two
// sibling containers, so it works without JS viewport measurement.

import { useState } from 'react'
import { Icon, type IconName } from '../Icon'
import type { PortalLocale } from '../../lib/portalLocale'
import { tokens } from './tokens'
import { useDismiss } from './useDismiss'

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

function itemStyle(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 14px',
    border: 'none',
    borderRadius: 999,
    background: active ? tokens.textPrimary : 'transparent',
    color: active ? '#fff' : tokens.textSecondary,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap' as const,
    transition: 'background .15s, color .15s',
  }
}

export function PortalNav({ loc, items, activeId }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(menuOpen, () => setMenuOpen(false))
  const activeItem = items.find(i => i.id === activeId)

  return (
    <>
      {/* Inline nav — hidden on narrow screens */}
      <nav className="pf-nav-inline" aria-label={loc.t('nav.menu')} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {items.map(item => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              className="pf-focus pf-anim"
              aria-current={active ? 'page' : undefined}
              onClick={item.onSelect}
              style={itemStyle(active)}
            >
              <Icon name={item.icon} size={14} strokeWidth={1.65} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Collapsed menu — shown on narrow screens */}
      <div className="pf-nav-collapsed" ref={ref} style={{ position: 'relative', display: 'none' }}>
        <button
          type="button"
          className="pf-focus pf-anim"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={loc.t('nav.menu')}
          onClick={() => setMenuOpen(o => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            border: `1px solid ${tokens.border}`,
            borderRadius: 999,
            background: '#fff',
            color: tokens.textPrimary,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Icon name="menu" size={15} strokeWidth={1.75} />
          {activeItem ? activeItem.label : loc.t('nav.menu')}
        </button>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              insetInlineStart: 0,
              marginTop: 8,
              background: '#fff',
              border: `1px solid ${tokens.border}`,
              borderRadius: 6,
              minWidth: 220,
              zIndex: 300,
              boxShadow: '0 12px 32px rgba(20,20,19,.12)',
              overflow: 'hidden',
            }}
          >
            {items.map(item => {
              const active = item.id === activeId
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="pf-focus"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { item.onSelect(); setMenuOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'start',
                    padding: '12px 16px',
                    border: 'none',
                    borderBottom: `1px solid ${tokens.border}`,
                    background: active ? tokens.bgSubtle : 'transparent',
                    color: tokens.textPrimary,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
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
