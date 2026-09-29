import { Icon } from '@/shared/ui/Icon'
import { Button } from '@/shared/ui'
import { exportProgressLabel } from '../../lib/exportProgressLabel'
import { useEditor } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

// Portable ZIP of every original + metadata.json: trust + migration safety net.
export function ZipBackupSection() {
  const { exporter: { exporting, exportProgress, handleGalleryExport } } = useEditor()
  return (
    <SettingsSection eyebrow="גיבוי וייצוא">
      <div className="flex flex-col gap-3.5">
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink">
            ייצא את כל הגלריה כקובץ ZIP
          </div>
          <div className="text-[12px] leading-[1.6] text-muted">
            כל המקור (או תצוגות web אם המקור לא הועלה) + metadata.json עם
            הגדרות הגלריה, סקציות וסדר התמונות. הקובץ נייד וניתן לשחזור בעתיד.
          </div>
        </div>
        <div>
          <Button
            onClick={handleGalleryExport}
            disabled={exporting}
            className="px-[18px] py-2.5 text-[12px] font-semibold tracking-[0.14em] disabled:cursor-wait disabled:border-line disabled:bg-surface disabled:text-muted disabled:opacity-70"
          >
            <Icon name="download" size={14} />
            <span>
              {exporting
                ? exportProgress
                  ? exportProgressLabel(exportProgress)
                  : 'מייצא...'
                : 'ייצא גלריה (ZIP)'}
            </span>
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
