import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { SettingsToggleRow } from './SettingsToggleRow'

const DOWNLOAD_OPTIONS = [
  { key: 'downloadsEnabled',    label: 'אפשר הורדת תמונות', desc: 'אורחים יוכלו להוריד תמונות בודדות' },
  { key: 'bulkDownloadEnabled', label: 'הורדה מרוכזת',     desc: 'אפשר הורדת כל התמונות בבת אחת' },
  { key: 'trackDownloads',      label: 'מעקב הורדות',      desc: 'עקוב מי הוריד ומתי' },
] as const

export function DownloadsSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="הורדות">
      {DOWNLOAD_OPTIONS.map((opt, i, arr) => (
        <SettingsToggleRow key={opt.key}
          label={opt.label} desc={opt.desc}
          on={Boolean(ds[opt.key])}
          onChange={() => updateGallerySetting(opt.key, !ds[opt.key])}
          last={i === arr.length - 1}
        />
      ))}
    </SettingsSection>
  )
}
