import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { PresetRow } from './PresetRow'

// Reusable delivery + appearance bundles; never carry identity or secrets.
export function PresetsSection() {
  const { presets: { presets, presetsLoaded, presetBusy, handleSavePreset } } = useEditor()
  return (
    <SettingsSection eyebrow="פריסטים">
      <div className="flex flex-col gap-2">
        {!presetsLoaded ? (
          <div className="py-1 text-[12px] text-muted">טוען…</div>
        ) : presets.length === 0 ? (
          <div className="py-1 text-[12px] leading-normal text-muted">
            עדיין אין פריסטים. שמרו את הגדרות הגלריה הנוכחית כפריסט לשימוש חוזר.
          </div>
        ) : (
          presets.map(p => <PresetRow key={p.id} preset={p} />)
        )}
        <button disabled={presetBusy} onClick={handleSavePreset} className={cn(
          'mt-1 inline-flex items-center gap-1.5 self-start rounded-hair border border-dashed border-line px-3.5 py-[9px] text-[12px] font-medium text-ink',
          presetBusy ? 'cursor-default' : 'cursor-pointer',
        )}>
          <Icon name="plus" size={13} strokeWidth={1.85} />
          שמור הגדרות נוכחיות כפריסט
        </button>
      </div>
    </SettingsSection>
  )
}
