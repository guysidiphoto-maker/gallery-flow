// TEMPORARY inline style objects for the create-gallery modal; removed by the Tailwind pass.
import { bgSubtle, border, textPrimary } from '../styles'

export const inputBase = {
  width: '100%', padding: '12px 14px', borderRadius: 2,
  border: `1px solid ${border}`,
  background: '#fff', color: textPrimary, fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box' as const,
  transition: 'border-color .15s',
}

export const labelStyle = {
  fontSize: 13, color: textPrimary, display: 'block' as const, marginBottom: 8,
  fontWeight: 500,
}

// Hairline-bordered picker tile; selected = cream background + charcoal border.
export const pickerTile = (selected: boolean) => ({
  background: selected ? bgSubtle : '#fff',
  border: `1px solid ${selected ? textPrimary : border}`,
  borderRadius: 2, padding: '18px 8px', cursor: 'pointer',
  display: 'flex' as const, flexDirection: 'column' as const,
  alignItems: 'center' as const, gap: 10,
  transition: 'border-color .15s, background .15s',
  fontFamily: 'inherit',
})
