import type { CreateGalleryState } from '../hooks/useCreateGallery'
import { bgSubtle, border, textMuted, textPrimary } from '../styles'
import { SwitchRow } from './SwitchRow'

const PRIVACY_MODES = [
  { id: 'open' as const,    label: 'פתוח',  desc: 'כולם רואים את כל התמונות' },
  { id: 'private' as const, label: 'פרטי',  desc: 'כל אורח רואה רק את התמונות שלו' },
]

// Turning face recognition ON goes through the confirm dialog first; once on,
// the open/private privacy sub-picker appears.
export function FaceRecognitionField({ form }: { form: CreateGalleryState }) {
  const { faceRecognition, setFaceRecognition, facePrivacyMode, setFacePrivacyMode, setShowFaceConfirm } = form
  return (
    <div style={{ marginBottom: 18 }}>
      <SwitchRow
        title="זיהוי פנים"
        desc="אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד"
        on={faceRecognition}
        onClick={() => {
          if (faceRecognition) {
            setFaceRecognition(false)
            setFacePrivacyMode('open')
          } else {
            setShowFaceConfirm(true)
          }
        }}
      />

      {faceRecognition && (
        <div style={{
          marginTop: 14, padding: 14,
          background: bgSubtle, border: `1px solid ${border}`,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 12,
          }}>
            מצב פרטיות
          </div>
          <div className="dash-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PRIVACY_MODES.map(m => {
              const selected = facePrivacyMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFacePrivacyMode(m.id)}
                  style={{
                    background: selected ? '#fff' : 'transparent',
                    border: `1px solid ${selected ? textPrimary : border}`,
                    borderRadius: 2, padding: '12px 14px', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'right' as const,
                    transition: 'border-color .15s, background .15s',
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: selected ? 600 : 500,
                    color: textPrimary, marginBottom: 4,
                  }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>
                    {m.desc}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
