import { Eyebrow, Input } from '@/shared/ui'
import { OptionTile } from '@/shared/ui/OptionTile'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { SettingsToggleRow } from './SettingsToggleRow'

const POSITIONS = [
  { id: 'bottom-right', label: '↘' },
  { id: 'bottom-left',  label: '↙' },
  { id: 'top-right',    label: '↗' },
  { id: 'top-left',     label: '↖' },
  { id: 'center',       label: '＋' },
] as const

export function WatermarkSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="ווטרמרק">
      <SettingsToggleRow
        label="הצג ווטרמרק על תצוגות web"
        desc="שם העסק יופיע בפינה — מקור ההורדה תמיד נקי"
        on={Boolean(ds.watermarkEnabled)}
        onChange={() => updateGallerySetting('watermarkEnabled', !ds.watermarkEnabled)}
        last
      />
      {Boolean(ds.watermarkEnabled) && (
        <div className="mt-3 border-t border-line pt-4">
          <label className="block">
            <Eyebrow className="mb-2 block text-[9px] font-medium">טקסט</Eyebrow>
            <Input
              type="text"
              value={String(ds.watermarkText ?? '')}
              onChange={(e) => updateGallerySetting('watermarkText', e.target.value)}
              placeholder="© השם שלך"
              className="py-3 text-[14px]"
            />
          </label>
          <Eyebrow className="mt-[18px] mb-2.5 block text-[9px] font-medium">מיקום</Eyebrow>
          <div className="flex gap-2">
            {POSITIONS.map(p => {
              const active = ((ds.watermarkPosition as string) || 'bottom-right') === p.id
              return (
                <OptionTile key={p.id} selected={active} onClick={() => updateGallerySetting('watermarkPosition', p.id)}
                  aria-label={p.id}
                  className="size-11 text-[18px] text-ink">{p.label}</OptionTile>
              )
            })}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
