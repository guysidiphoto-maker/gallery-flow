import { border, textMuted, textPrimary, textSecondary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { THEME_COLORS } from '../themeColors'
import { labelStyle } from './designStyles'

const APPEARANCES = [
  { id: 'editorial', label: 'אדיטוריאל', sw: '#0a0a0f' },
  { id: 'light',     label: 'בהיר',       sw: '#faf9f7' },
  { id: 'dark',      label: 'כהה',        sw: '#111114' },
] as const

// Appearance (contrast-safe bg + text theme) and accent palette.
export function ColorSubTab() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ ...labelStyle }}>מראה הגלריה</div>
        <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4, margin: '0 0 8px' }}>
          רקע וצבע טקסט — נגישים תמיד. ברירת המחדל מגיעה ממותג העסק.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {APPEARANCES.map(a => {
            const active = ((ds.appearance as string) || 'editorial') === a.id
            return (
              <button key={a.id} onClick={() => updateGallerySetting('appearance', a.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? textPrimary : border}`,
                  background: active ? '#fff' : 'transparent',
                  fontSize: 12, fontWeight: active ? 600 : 500, color: textPrimary,
                  transition: 'border-color .15s, background .15s',
                }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: a.sw, border: `1px solid ${border}` }} />
                {a.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
        צבע ההדגשה — משפיע על כפתורים, קישורים ומצבים פעילים בגלריה הציבורית.
        טקסט הכפתור מתכוונן אוטומטית לניגודיות קריאה.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {THEME_COLORS.map(c => {
          const active = ((ds.themeColor as string) || 'charcoal') === c.id
          return (
            <button key={c.id} onClick={() => updateGallerySetting('themeColor', c.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                border: `1px solid ${active ? textPrimary : border}`,
                background: active ? '#fff' : 'transparent',
                borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color .15s, background .15s',
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: c.color,
              }} />
              <span style={{
                fontSize: 10, fontWeight: 500, color: textPrimary,
                letterSpacing: '0.04em',
              }}>{c.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
