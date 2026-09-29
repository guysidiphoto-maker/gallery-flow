import type { t } from '@/shared/i18n/viewerStrings'
import { heroEyebrow, heroTitle } from './heroStyles'

export function DefaultHeroContent({ txt, studioName, galleryTitle, clientName, photoCount, secured }: {
  txt: ReturnType<typeof t>
  studioName: string
  galleryTitle: string
  clientName: string | null | undefined
  photoCount: number
  secured: boolean
}) {
  return (
    <>
      {studioName && <p className={heroEyebrow}>{studioName}</p>}
      <h1 className={heroTitle}>{galleryTitle}</h1>
      {clientName && (
        <p className="gv-hero-sub-shadow mt-[clamp(6px,0.7vw,10px)] text-[clamp(14px,1.5vw,18px)] font-medium tracking-[0.01em] text-white/78">{clientName}</p>
      )}
      <div className="mt-[clamp(12px,1.4vw,18px)] flex items-center justify-center">
        <span className="inline-flex items-center rounded-full border border-white/13 bg-white/7 px-3.5 py-[5px] text-[10.5px] font-semibold tracking-[0.08em] text-white/80 uppercase backdrop-blur-[16px] text-shadow-[0_1px_4px_var(--color-black)]/20">
          {txt.photoCount(photoCount)}
        </span>
        {secured && (
          <span className="ms-2 inline-flex items-center gap-[5px] rounded-full border border-(--viewer-success)/10 bg-(--viewer-success)/6 px-3 py-[5px] text-[10px] font-semibold tracking-[.06em] text-(--viewer-success)/70 uppercase backdrop-blur-[16px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {txt.secured}
          </span>
        )}
      </div>
    </>
  )
}
