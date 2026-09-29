// TEMPORARY inline-style objects shared by the Design sub-tabs (Tailwind wave removes them).
import { border, textMuted, textPrimary } from '../../styles'

export const inputBase = {
  width: '100%', padding: '12px 14px', borderRadius: 2,
  border: `1px solid ${border}`,
  background: '#fff', color: textPrimary, fontSize: 14,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
  transition: 'border-color .15s', direction: 'rtl' as const,
}

export const labelStyle = {
  fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
  color: textMuted, textTransform: 'uppercase' as const,
  display: 'block' as const, marginBottom: 8,
}

// Selected = white surface with a 1px charcoal border.
export const tileStyle = (selected: boolean) => ({
  background: selected ? '#fff' : 'transparent',
  border: `1px solid ${selected ? textPrimary : border}`,
  borderRadius: 2, padding: '16px 12px', cursor: 'pointer',
  fontFamily: 'inherit', textAlign: 'right' as const,
  transition: 'border-color .15s, background .15s',
  display: 'flex' as const, flexDirection: 'column' as const,
  alignItems: 'center' as const, gap: 8,
})

type FocusEl = { currentTarget: HTMLElement }
export const focusBorder = (e: FocusEl) => { e.currentTarget.style.borderColor = textPrimary }
export const blurBorder = (e: FocusEl) => { e.currentTarget.style.borderColor = border }
