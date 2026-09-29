import { Spinner } from '@/shared/ui'
import { EventCaptureForm } from './EventCaptureForm'
import { EventCaptureSuccess } from './EventCaptureSuccess'
import { useEventCapture } from './useEventCapture'
import './event-capture.css'

/** QR lead capture at /event/{id}: guests leave a phone number and get the gallery link. */
export function EventCapturePage() {
  const form = useEventCapture()
  const { phase, event } = form

  return (
    <div
      dir="rtl"
      className="ec-root flex min-h-dvh flex-col items-center bg-night px-5 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] text-white antialiased"
    >
      {phase === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-8 animate-spin-slow border-[3px] border-brand/15 border-t-brand" />
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="mb-2 text-[18px] font-semibold">הקישור לא נמצא</p>
          <p className="text-[14px] text-white/40">
            יכול להיות שהאירוע הסתיים או שהקישור לא תקין
          </p>
        </div>
      )}

      {(phase === 'form' || phase === 'submitting') && event && <EventCaptureForm form={form} />}

      {phase === 'done' && <EventCaptureSuccess whatsappSent={form.whatsappSent} galleryUrl={form.galleryUrl} />}
    </div>
  )
}
