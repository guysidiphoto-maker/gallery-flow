import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { THEME_COLORS } from '../themeColors'
import { SettingsSection } from './SettingsSection'

export function ThemeColorSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="צבע ראשי">
      <div style={{ fontSize: 12, color: textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        הצבע שמופיע בכפתורים ומסגרות בגלריה הציבורית
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {THEME_COLORS.map(c => {
          const active = ((ds.themeColor as string) || 'charcoal') === c.id
          return (
            <button key={c.id} onClick={() => updateGallerySetting('themeColor', c.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              border: `1px solid ${active ? textPrimary : border}`,
              background: active ? '#fff' : 'transparent',
              borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'border-color .15s, background .15s',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: c.color,
              }} />
              <span style={{
                fontSize: 10, fontWeight: 500, color: textPrimary,
                letterSpacing: '0.04em',
              }}>
                {c.label}
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
