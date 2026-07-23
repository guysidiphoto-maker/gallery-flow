// LocaleToggle — a clean he/en switch that lives in the portal shell. Shows the
// language you can switch TO (so its own label never mixes into the active UI).

import type { PortalLocale } from '../../lib/portalLocale'
import { tokens } from './tokens'

export function LocaleToggle({ loc }: { loc: PortalLocale }) {
  return (
    <button
      type="button"
      className="pf-focus pf-anim"
      onClick={loc.toggle}
      aria-label={loc.t('lang.label')}
      style={{
        padding: '7px 12px',
        border: `1px solid ${tokens.border}`,
        borderRadius: 999,
        background: '#fff',
        color: tokens.textSecondary,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        transition: 'border-color .15s, color .15s',
        whiteSpace: 'nowrap',
      }}
    >
      {loc.t('lang.toggle')}
    </button>
  )
}
