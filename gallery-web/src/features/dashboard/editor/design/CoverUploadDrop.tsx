import { Icon } from '@/shared/ui/Icon'
import { border, textMuted, textPrimary } from '../../styles'
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
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '28px 16px', borderRadius: 10, textAlign: 'center',
          border: `1.5px dashed ${coverDragOver ? textPrimary : border}`,
          background: coverDragOver ? 'rgba(20,20,19,.03)' : 'transparent',
          cursor: coverUploading ? 'default' : 'pointer',
          transition: 'border-color .15s, background .15s',
        }}>
        <Icon name="photo" size={24} strokeWidth={1.4} />
        {coverUploading ? (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: textPrimary }}>
              {coverUploadPhase ? PHASE_LABEL[coverUploadPhase] : 'מעלה…'}
            </div>
            <div style={{ width: '70%', maxWidth: 220, height: 4, borderRadius: 4, overflow: 'hidden', background: '#e6e4e0' }}>
              <div style={{ width: '45%', height: '100%', background: textPrimary, borderRadius: 4, animation: 'dl-progress-pulse 1.1s ease-in-out infinite' }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>גררו תמונה לכאן או לחצו לבחירה</div>
            <div style={{ fontSize: 11, color: textMuted }}>JPG · PNG · WebP · עד 40MB</div>
          </>
        )}
        <input
          id="cover-upload-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={coverUploading}
          onChange={e => { void handleCoverFile(e.target.files?.[0]); e.currentTarget.value = '' }}
          style={{ display: 'none' }}
        />
      </label>
      <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5, marginTop: 8 }}>
        תמונה שמועלית כאן משמשת <strong>כשער בלבד</strong> ולא תתווסף לתמונות הגלריה.
      </div>
    </div>
  )
}
