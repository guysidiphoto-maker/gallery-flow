import { TurnstileWidget } from '@/shared/ui/TurnstileWidget'

/** Frames the Turnstile challenge when the session endpoint asks for one (usually invisible). */
export function TurnstileOverlay({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  return (
    <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center gap-4 bg-black/85 p-6">
      <div className="w-full max-w-[360px] rounded-[12px] bg-white px-7 py-8 text-center font-(family-name:--viewer-system-font)">
        <h2 className="mb-2 text-[18px] text-night">
          רגע, מאמתים שאתה לא רובוט
        </h2>
        <p className="mb-4 text-[13px] text-black/60">
          זה לוקח שנייה ויעבור אוטומטית.
        </p>
        <TurnstileWidget siteKey={siteKey} onToken={onToken} />
      </div>
    </div>
  )
}
