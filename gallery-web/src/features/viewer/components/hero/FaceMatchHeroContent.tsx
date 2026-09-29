import { cn } from '@/shared/ui'
import type { AnimationSpeed, TextAnimation } from '../../lib/viewerSettings'
import { OpeningText } from '../OpeningText'
import { heroEyebrow, heroTitle } from './heroStyles'

const segment = 'rounded-full px-[18px] py-2 text-[12px] font-semibold tracking-[.01em] whitespace-nowrap transition-all duration-250 ease-[cubic-bezier(.16,1,.3,1)]'

/** Personalized hero after a face search: selfie, opening line and a Your/All photos toggle. */
export function FaceMatchHeroContent({
  selfieUrl, studioName, galleryTitle, welcomeMessage, textAnimation, animationSpeed,
  isPrivate, matchCount, totalCount, faceFilterActive, onFilterChange,
}: {
  selfieUrl: string
  studioName: string
  galleryTitle: string
  welcomeMessage: string | undefined
  textAnimation: TextAnimation
  animationSpeed: AnimationSpeed
  isPrivate: boolean
  matchCount: number
  totalCount: number
  faceFilterActive: boolean
  onFilterChange: (active: boolean) => void
}) {
  return (
    <>
      <div className="mb-4 size-14 overflow-hidden rounded-full border-[2.5px] border-white/18 shadow-[0_4px_20px] shadow-black/30 ring-4 ring-brand/12">
        <img src={selfieUrl} alt="" className="size-full object-cover" />
      </div>

      {studioName && <p className={heroEyebrow}>{studioName}</p>}
      <h1 className={cn(heroTitle, 'text-[clamp(24px,4vw,44px)] max-[641px]:text-[clamp(24px,4vw,44px)]')}>{galleryTitle}</h1>

      {/* Same opening line as the public welcome; mounts once so toggles don't replay it. */}
      <OpeningText message={welcomeMessage} animation={textAnimation} speed={animationSpeed} marginTop={18} />

      {isPrivate && (
        <div className="mt-2 mb-1 inline-flex items-center gap-[5px] rounded-full border border-(--viewer-success)/10 bg-(--viewer-success)/6 px-3 py-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-(--viewer-success)/65">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span className="text-[10px] font-semibold tracking-[.05em] text-(--viewer-success)/60 uppercase">
            Your photos are protected
          </span>
        </div>
      )}

      <div className="mt-4 inline-flex rounded-full border border-white/7 bg-white/5 p-[3px] backdrop-blur-[12px]">
        <button
          onClick={() => onFilterChange(true)}
          className={cn(segment, faceFilterActive ? 'bg-brand/25 text-white shadow-[0_1px_6px] shadow-brand/20' : 'bg-transparent text-white/40')}
        >
          Your Photos · {matchCount}
        </button>
        <button
          onClick={() => onFilterChange(false)}
          className={cn(segment, !faceFilterActive ? 'bg-white/12 text-white shadow-[0_1px_4px] shadow-black/20' : 'bg-transparent text-white/40')}
        >
          All Photos · {totalCount}
        </button>
      </div>
    </>
  )
}
