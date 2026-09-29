import { border, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

const FEED_LAYOUTS = [
  { id: 'grid',     label: 'רשת' },
  { id: 'masonry',  label: 'מוזאיקה' },
  { id: 'carousel', label: 'קרוסלה' },
] as const

export function LayoutSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="תצוגה">
      <div style={{ fontSize: 13, color: textPrimary, fontWeight: 500, marginBottom: 12 }}>סגנון פיד</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {FEED_LAYOUTS.map(l => {
          const active = ((ds.feedLayout as string) || 'grid') === l.id
          return (
            <button key={l.id} onClick={() => updateGallerySetting('feedLayout', l.id)} style={{
              flex: 1, padding: '12px 16px',
              border: `1px solid ${active ? textPrimary : border}`,
              background: active ? '#fff' : 'transparent',
              borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary,
              transition: 'border-color .15s, background .15s',
            }}>{l.label}</button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
