import { cn } from '@/shared/ui'
import { FaceSearchButton } from '../FaceSearchButton'
import { dirClass, type FaceSearchLang, type FaceTexts } from '../faceSearchTexts'

interface Props {
  ft: FaceTexts
  lang: FaceSearchLang
  selfieUrl: string | null
  matchCount: number
  onViewPhotos: () => void
}

export function FoundStep({ ft, lang, selfieUrl, matchCount, onViewPhotos }: Props) {
  return (
    <div className="animate-[fse-scaleIn_.7s_cubic-bezier(.16,1,.3,1)_both]">
      {selfieUrl && (
        <div className="relative mx-auto mb-7 size-[110px]">
          <div className="absolute -inset-3 animate-[fse-glow_2s_ease-in-out_infinite] rounded-full bg-radial/srgb from-(--fs-success)/15 to-transparent to-70%" />
          <div className="size-full animate-[fse-successGlow_2.5s_ease-in-out_infinite] overflow-hidden rounded-full border-3 border-(--fs-success)/50">
            <img src={selfieUrl} alt="" className="size-full object-cover" />
          </div>
          <div className="absolute -right-1 -bottom-1 flex size-8 animate-[fse-successPop_.5s_cubic-bezier(.16,1,.3,1)_.3s_both] items-center justify-center rounded-full bg-linear-135/srgb from-(--fs-emerald) to-(--fs-emerald-soft) text-white shadow-[0_4px_12px_var(--fs-emerald)]/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={cn(
                'absolute top-1/2 left-1/2 size-1 rounded-full',
                i % 2 === 0 ? 'bg-(--fs-success)/60' : 'bg-brand/60',
              )}
              style={{
                animation: `fse-confettiFloat 1s cubic-bezier(.16,1,.3,1) ${0.2 + i * 0.08}s both`,
                marginTop: Math.sin(i * 60 * Math.PI / 180) * 55,
                marginLeft: Math.cos(i * 60 * Math.PI / 180) * 55,
              }}
            />
          ))}
        </div>
      )}

      <h2 className={cn('mb-2 animate-[fse-fadeIn_.5s_cubic-bezier(.16,1,.3,1)_.15s_both] text-[30px] font-extrabold tracking-[-0.03em] text-white', dirClass(lang))}>
        {lang === 'he' ? '!מצאנו אותך' : 'We found you!'}
      </h2>

      <p className={cn('mb-4 animate-[fse-fadeIn_.5s_ease_.25s_both] text-[15px] leading-[1.7] text-white/40', dirClass(lang))}>
        {lang === 'he' ? 'יש פה רגעים שלך — יאללה, תתחיל/י לעבור' : 'Your moments are here — go ahead, start browsing!'}
      </p>

      <div className="mb-8 inline-flex animate-[fse-countUp_.5s_cubic-bezier(.16,1,.3,1)_.35s_both] items-center gap-2.5 rounded-3xl border border-(--fs-success)/12 bg-(--fs-success)/6 px-6 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-full bg-(--fs-success)/10">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-(--fs-success)/70">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
        <span className="text-[15px] font-bold tracking-[.01em] text-(--fs-success)/85">
          {matchCount} {ft.photosFound}
        </span>
      </div>

      <div className="animate-[fse-fadeIn_.5s_ease_.45s_both]">
        <FaceSearchButton variant="success" onClick={onViewPhotos} className="w-full max-w-80 justify-center px-10 py-[18px] text-base">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {ft.viewYourPhotos}
        </FaceSearchButton>
      </div>
    </div>
  )
}
