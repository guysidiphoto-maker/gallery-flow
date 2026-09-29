import { cn } from '@/shared/ui'
import { GRADIENT_CTA } from './fieldStyles'

export function QuestionnaireSuccess({ galleryId }: { galleryId?: string | null }) {
  return (
    <div className="relative z-[1] flex flex-1 animate-[q-fade-in_0.5s_ease_both] flex-col items-center justify-center py-10 text-center">
      <div className="mb-6 flex size-[72px] animate-[q-check_0.5s_var(--ease-out-expo)_both] items-center justify-center rounded-full border-2 border-(--q-success)/30 bg-(--q-success)/10">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-(--q-success)">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 className="mb-2 text-[22px] font-bold">תודה רבה!</h2>
      <p className="m-0 text-[14px] leading-[1.6] text-(--q-muted)">התשובות שלך נשלחו בהצלחה</p>

      {galleryId && (
        <a
          href={`/gallery/${galleryId}`}
          className={cn(GRADIENT_CTA, 'mt-8 inline-flex items-center gap-2.5 rounded-[14px] px-10 py-4 text-[16px] no-underline')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          צפה בגלריה
        </a>
      )}
    </div>
  )
}
