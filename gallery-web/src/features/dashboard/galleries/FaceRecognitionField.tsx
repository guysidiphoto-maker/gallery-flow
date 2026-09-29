import type { CreateGalleryState } from '../hooks/useCreateGallery'
import { cn, Eyebrow } from '@/shared/ui'
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
    <div className="mb-[18px]">
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
        <div className="mt-3.5 border border-line bg-surface p-3.5">
          <Eyebrow className="mb-3 block text-[9px] font-medium">מצב פרטיות</Eyebrow>
          <div className="dash-grid-2 grid grid-cols-2 gap-2">
            {PRIVACY_MODES.map(m => {
              const selected = facePrivacyMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFacePrivacyMode(m.id)}
                  className={cn(
                    'cursor-pointer rounded-hair border px-3.5 py-3 text-right transition-[border-color,background-color] duration-150',
                    selected ? 'border-ink bg-raised' : 'border-line bg-transparent',
                  )}
                >
                  <div className={cn('mb-1 text-[13px] text-ink', selected ? 'font-semibold' : 'font-medium')}>{m.label}</div>
                  <div className="text-[11px] leading-[1.4] text-muted">
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
