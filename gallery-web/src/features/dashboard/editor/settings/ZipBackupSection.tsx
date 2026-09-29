import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted, textPrimary } from '../../styles'
import { exportProgressLabel } from '../../lib/exportProgressLabel'
import { useEditor } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

// Portable ZIP of every original + metadata.json: trust + migration safety net.
export function ZipBackupSection() {
  const { exporter: { exporting, exportProgress, handleGalleryExport } } = useEditor()
  return (
    <SettingsSection eyebrow="גיבוי וייצוא">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
            ייצא את כל הגלריה כקובץ ZIP
          </div>
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6 }}>
            כל המקור (או תצוגות web אם המקור לא הועלה) + metadata.json עם
            הגדרות הגלריה, סקציות וסדר התמונות. הקובץ נייד וניתן לשחזור בעתיד.
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={handleGalleryExport}
            disabled={exporting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 2,
              background: exporting ? bgSubtle : textPrimary,
              color: exporting ? textMuted : '#fff',
              border: `1px solid ${exporting ? border : textPrimary}`,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <Icon name="download" size={14} />
            <span>
              {exporting
                ? exportProgress
                  ? exportProgressLabel(exportProgress)
                  : 'מייצא...'
                : 'ייצא גלריה (ZIP)'}
            </span>
          </button>
        </div>
      </div>
    </SettingsSection>
  )
}
