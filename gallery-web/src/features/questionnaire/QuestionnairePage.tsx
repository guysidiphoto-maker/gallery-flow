import { Spinner } from '@/shared/ui'
import { QuestionnaireForm } from './QuestionnaireForm'
import { QuestionnaireSuccess } from './QuestionnaireSuccess'
import { TiktokBackground } from './TiktokBackground'
import { useQuestionnaire } from './useQuestionnaire'
import './questionnaire.css'

/** Public questionnaire at /q/{id|slug}; answers go to /api/submit-questionnaire. */
export function QuestionnairePage() {
  const form = useQuestionnaire()
  const { phase, config } = form
  const bgUrl = config?.background_url
  const bgAnim = config?.bg_animation
  // A background image/animation needs a dark, glassy card for contrast.
  const dark = !!(bgUrl || bgAnim)

  return (
    <div
      dir="rtl"
      data-dark={dark || undefined}
      className="q-root relative flex min-h-dvh flex-col items-center overflow-hidden bg-(--q-bg) px-5 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] text-(--q-text) antialiased"
    >
      {bgUrl && !bgAnim && (
        <>
          <div
            className="fixed inset-[-10%] z-0 animate-[q-ken-burns_25s_ease-in-out_infinite] bg-cover bg-center"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          <div className="fixed inset-0 z-0 bg-black/50" />
        </>
      )}

      {bgAnim === 'tiktok-3d' && <TiktokBackground />}

      {phase === 'loading' && (
        <div className="relative z-[1] flex flex-1 items-center justify-center">
          <Spinner className="size-8 animate-spin-slow border-[3px] border-brand/15 border-t-brand" />
        </div>
      )}

      {phase === 'error' && (
        <div className="relative z-[1] flex flex-1 flex-col items-center justify-center text-center">
          <p className="mb-2 text-[18px] font-semibold">השאלון לא נמצא</p>
          <p className="text-[14px] text-(--q-muted)">
            יכול להיות שהשאלון כבר לא פעיל או שהקישור לא תקין
          </p>
        </div>
      )}

      {(phase === 'form' || phase === 'submitting') && config && (
        <QuestionnaireForm form={form} dark={dark} />
      )}

      {phase === 'done' && <QuestionnaireSuccess galleryId={config?.gallery_id} />}
    </div>
  )
}
