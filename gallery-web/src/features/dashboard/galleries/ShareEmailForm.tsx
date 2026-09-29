import type { ShareGalleryState } from '../hooks/useShareGallery'
import { accent, accentLight, border, textMuted, textPrimary, textSecondary } from '../styles'

const fieldLabel = { display: 'block', fontSize: 12, color: textMuted, marginBottom: 6, fontWeight: 600 } as const

// Recipient / subject / message fields, preview link, cancel + send.
export function ShareEmailForm({ share }: { share: ShareGalleryState }) {
  const { shareEmail, shareSubject, shareMessage, shareSending, previewLoading } = share
  return (
    <>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabel}>
          כתובת מייל של הלקוח
        </span>
        <input
          type="email"
          value={shareEmail}
          onChange={e => share.setShareEmail(e.target.value)}
          placeholder="client@example.com"
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
            color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
            direction: 'ltr', textAlign: 'left',
          }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabel}>
          נושא
        </span>
        <input
          type="text"
          value={shareSubject}
          onChange={e => share.setShareSubject(e.target.value)}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
            color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 24 }}>
        <span style={fieldLabel}>
          הודעה אישית (אופציונלי)
        </span>
        <textarea
          value={shareMessage}
          onChange={e => share.setShareMessage(e.target.value)}
          rows={3}
          placeholder="תודה רבה על האירוע! תהנו מהתמונות..."
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
            color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
            resize: 'vertical', minHeight: 80,
          }}
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
        <button
          type="button"
          onClick={share.previewShareEmail}
          disabled={shareSending || previewLoading}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            color: textSecondary, fontSize: 13, fontWeight: 600,
            cursor: previewLoading ? 'wait' : 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 4,
            fontFamily: 'inherit', opacity: shareSending ? 0.5 : 1,
          }}
        >
          {previewLoading ? 'טוען…' : 'תצוגה מקדימה'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => share.setShareGallery(null)}
          disabled={shareSending}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            background: 'transparent', color: textSecondary,
            border: `1px solid ${border}`, fontSize: 14, fontWeight: 600,
            cursor: shareSending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: shareSending ? 0.5 : 1,
          }}
        >
          ביטול
        </button>
        <button
          onClick={share.sendShareEmail}
          disabled={shareSending || !shareEmail}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            background: shareSending || !shareEmail
              ? 'rgba(45,196,121,.4)'
              : `linear-gradient(135deg, ${accent}, ${accentLight})`,
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
            cursor: shareSending || !shareEmail ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'all .15s',
          }}
        >
          {shareSending ? 'שולח...' : 'שלח'}
        </button>
      </div>
    </>
  )
}
