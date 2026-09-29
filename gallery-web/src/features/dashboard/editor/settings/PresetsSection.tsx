import { Icon } from '@/shared/ui/Icon'
import { border, textMuted, textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { PresetRow } from './PresetRow'

// Reusable delivery + appearance bundles; never carry identity or secrets.
export function PresetsSection() {
  const { presets: { presets, presetsLoaded, presetBusy, handleSavePreset } } = useEditor()
  return (
    <SettingsSection eyebrow="פריסטים">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!presetsLoaded ? (
          <div style={{ fontSize: 12, color: textMuted, padding: '4px 0' }}>טוען…</div>
        ) : presets.length === 0 ? (
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5, padding: '4px 0' }}>
            עדיין אין פריסטים. שמרו את הגדרות הגלריה הנוכחית כפריסט לשימוש חוזר.
          </div>
        ) : (
          presets.map(p => <PresetRow key={p.id} preset={p} />)
        )}
        <button disabled={presetBusy} onClick={handleSavePreset} style={{
          alignSelf: 'flex-start', marginTop: 4, padding: '9px 14px', borderRadius: 2,
          border: `1px dashed ${border}`, background: 'transparent', color: textPrimary,
          fontSize: 12, fontWeight: 500, cursor: presetBusy ? 'default' : 'pointer',
          fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="plus" size={13} strokeWidth={1.85} />
          שמור הגדרות נוכחיות כפריסט
        </button>
      </div>
    </SettingsSection>
  )
}
