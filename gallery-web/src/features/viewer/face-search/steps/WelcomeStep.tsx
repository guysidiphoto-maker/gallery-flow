import { cn } from '@/shared/ui'
import { FaceSearchButton } from '../FaceSearchButton'
import { dirClass, type FaceSearchLang, type FaceTexts } from '../faceSearchTexts'

interface Props {
  ft: FaceTexts
  lang: FaceSearchLang
  onStart: () => void
}

export function WelcomeStep({ ft, lang, onStart }: Props) {
  return (
    <div className="animate-[fse-fadeIn_.8s_cubic-bezier(.16,1,.3,1)_both]">
      <div className="relative mx-auto mb-8 flex size-[88px] items-center justify-center rounded-full border-[1.5px] border-brand/12 bg-brand/6">
        <div className="absolute -inset-1.5 animate-[fse-orbit_12s_linear_infinite] rounded-full border-[1.5px] border-dashed border-brand/15" />
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-brand/60">
          <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </div>

      <h1 className="mb-2.5 text-[26px] leading-[1.2] font-extrabold tracking-[-0.03em] text-white">
        {ft.findYourPhotos}
      </h1>

      <p className={cn('mx-auto mb-8 max-w-[280px] text-[15px] leading-[1.7] text-white/40', dirClass(lang))}>
        {ft.takeSelfie}
      </p>

      <FaceSearchButton variant="primary" onClick={onStart} className="mb-4 px-[52px] py-[18px] text-[16px]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {ft.findMyPhotos}
      </FaceSearchButton>

      <div className="mt-2 flex items-center justify-center gap-1.5 opacity-55">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-(--fs-success)/80">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span className="text-[11px] tracking-[.02em] text-white/40">
          {ft.selfiePrivacy}
        </span>
      </div>
    </div>
  )
}
