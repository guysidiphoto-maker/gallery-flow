// AccountMenu — the integrated account control in the portal shell (never a
// detached floating button). Shows the signed-in email + client name and a
// single real Logout action. Wired to the preserved handleSignOut handler.

import { useState, type CSSProperties } from 'react'
import { Icon } from '../Icon'
import type { PortalLocale } from '../../lib/portalLocale'
import { tokens } from './tokens'
import { useDismiss } from './useDismiss'

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

  const trigger: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px 7px 8px',
    border: `1px solid ${open ? tokens.textPrimary : tokens.border}`,
    borderRadius: 999,
    background: open ? tokens.textPrimary : '#fff',
    color: open ? '#fff' : tokens.textPrimary,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    transition: 'background .15s, color .15s, border-color .15s',
    whiteSpace: 'nowrap',
  }

  const avatarInitial = (clientName || email || '?').trim().charAt(0)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="pf-focus pf-anim"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={loc.t('account.title')}
        style={trigger}
      >
        <span
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: open ? 'rgba(255,255,255,.18)' : tokens.bgSubtle,
            border: `1px solid ${open ? 'rgba(255,255,255,.4)' : tokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {avatarInitial}
        </span>
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {loc.t('account.button')}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            insetInlineEnd: 0,
            marginTop: 8,
            background: '#fff',
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            minWidth: 240,
            zIndex: 300,
            boxShadow: '0 12px 32px rgba(20,20,19,.12)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${tokens.border}`, background: tokens.bgSubtle }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: tokens.textMuted, marginBottom: 6 }}>
              {loc.t('account.signedInAs')}
            </div>
            <div
              dir="ltr"
              style={{
                fontSize: 13,
                color: tokens.textPrimary,
                textAlign: loc.dir === 'rtl' ? 'right' : 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email ?? '—'}
            </div>
            {clientName && (
              <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 4 }}>
                {loc.t('account.client')}: {clientName}
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            className="pf-focus"
            onClick={onSignOut}
            disabled={signingOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'start',
              padding: '13px 16px',
              border: 'none',
              background: 'transparent',
              color: tokens.textPrimary,
              cursor: signingOut ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 500,
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            <Icon name="logout" size={15} strokeWidth={1.75} />
            {signingOut ? loc.t('account.loggingOut') : loc.t('account.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
