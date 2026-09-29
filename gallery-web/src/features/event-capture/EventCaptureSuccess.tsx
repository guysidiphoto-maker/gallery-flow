export function EventCaptureSuccess({ whatsappSent, galleryUrl }: { whatsappSent: boolean; galleryUrl: string }) {
  return (
    <div className="flex flex-1 animate-[ec-fade-in_0.5s_ease_both] flex-col items-center justify-center py-10 text-center">
      <div className="mb-6 flex size-[72px] animate-[ec-check_0.5s_var(--ease-out-expo)_both] items-center justify-center rounded-full border-2 border-(--ec-success)/30 bg-(--ec-success)/10">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-(--ec-success)">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 className="mb-2 text-[22px] font-bold">
        {whatsappSent ? 'הקישור נשלח אליך ב-SMS!' : 'נרשמת בהצלחה!'}
      </h2>

      <p className="mb-8 text-[14px] leading-[1.6] text-white/40">
        {whatsappSent
          ? 'תוך כמה שניות תקבל SMS עם הלינק לגלריה'
          : 'הלינק לגלריה מופיע כאן למטה'
        }
      </p>

      <a
        href={galleryUrl}
        className="inline-flex items-center gap-2.5 rounded-[14px] bg-linear-135/srgb from-brand to-brand-violet px-10 py-4 text-[16px] font-bold text-white no-underline transition-transform duration-150"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        פתח את הגלריה
      </a>
    </div>
  )
}
