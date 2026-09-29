import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'

const PHASE_LABEL: Record<string, string> = {
  validating: 'בודק קובץ…',
  processing: 'מעבד תמונה…',
  uploading: 'מעלה…',
  done: 'הושלם',
  error: 'שגיאה',
}

// Cover-only upload (never added to the gallery photos).
export function CoverUploadDrop() {
  const { cover: { coverUploading, coverUploadPhase, coverDragOver, setCoverDragOver, handleCoverFile } } = useEditor()
  return (
    <div>
      <label
        htmlFor="cover-upload-input"
        onDragOver={e => { e.preventDefault(); setCoverDragOver(true) }}
        onDragLeave={() => setCoverDragOver(false)}
        onDrop={e => { e.preventDefault(); void handleCoverFile(e.dataTransfer.files?.[0]) }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed px-4 py-7 text-center transition-colors duration-150',
          coverDragOver ? 'border-ink bg-ink/3' : 'border-line bg-transparent',
          coverUploading ? 'cursor-default' : 'cursor-pointer',
        )}>
        <Icon name="photo" size={24} strokeWidth={1.4} />
        {coverUploading ? (
          <>
            <div className="text-[12.5px] font-semibold text-ink">
              {coverUploadPhase ? PHASE_LABEL[coverUploadPhase] : 'מעלה…'}
            </div>
            <div className="h-1 w-[70%] max-w-[220px] overflow-hidden rounded-[4px] bg-line-soft">
              {/* dl-progress-pulse keyframes live in legacy.css. */}
              <div className="h-full w-[45%] animate-[dl-progress-pulse_1.1s_ease-in-out_infinite] rounded-[4px] bg-ink" />
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] font-semibold text-ink">גררו תמונה לכאן או לחצו לבחירה</div>
            <div className="text-[11px] text-muted">JPG · PNG · WebP · עד 40MB</div>
          </>
        )}
        <input
          id="cover-upload-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={coverUploading}
          onChange={e => { void handleCoverFile(e.target.files?.[0]); e.currentTarget.value = '' }}
          className="hidden"
        />
      </label>
      <div className="mt-2 text-[11px] leading-normal text-muted">
        תמונה שמועלית כאן משמשת <strong>כשער בלבד</strong> ולא תתווסף לתמונות הגלריה.
      </div>
    </div>
  )
}
