import { cn } from '@/shared/ui'
import { fontFamilyCss } from '@/shared/gallery/galleryBranding'
import { t, type Lang } from '@/shared/i18n/viewerStrings'
import type { AnimationSpeed, TextAnimation, WelcomeStyle } from '../../lib/viewerSettings'
import { OpeningText } from '../OpeningText'

const fadeUp = {
  studio: 'animate-[wcFadeUp_.9s_cubic-bezier(.16,1,.3,1)_.3s_both]',
  client: 'animate-[wcFadeUp_.9s_cubic-bezier(.16,1,.3,1)_.65s_both]',
  meta: 'animate-[wcFadeUp_.8s_cubic-bezier(.16,1,.3,1)_.8s_both]',
  description: 'animate-[wcFadeUp_.8s_cubic-bezier(.16,1,.3,1)_.85s_both]',
  privacy: 'animate-[wcFadeUp_.8s_cubic-bezier(.16,1,.3,1)_.9s_both]',
}

const TITLE_ENTRANCE: Record<WelcomeStyle, string> = {
  cinematic: 'animate-[wcReveal_1.4s_cubic-bezier(.16,1,.3,1)_.5s_both]',
  minimal: 'animate-[wcLetterSpace_1.2s_cubic-bezier(.16,1,.3,1)_.4s_both]',
  mosaic: 'animate-[wcFadeUp_1s_cubic-bezier(.16,1,.3,1)_.5s_both]',
}

/** Buttons wait until the opening line is about half revealed. */
function buttonsDelay(opening: string | undefined): number {
  if (!opening) return 1
  const wc = opening.split(/\s+/).filter(Boolean).length || 1
  return 2.2 + wc * Math.min(0.12, 2 / wc) * 0.6
}

export function WelcomeContent({
  style, galleryTitle, galleryDescription, welcomeMessage, textAnimation, animationSpeed,
  eventDate, eventLocation, clientName, studioName, studioWebsite, headingFont, bodyFont,
  isPrivate, showFindButton, lang, onEnter, onFindMyPhotos,
}: {
  style: WelcomeStyle
  galleryTitle: string
  galleryDescription?: string
  welcomeMessage?: string
  textAnimation: TextAnimation
  animationSpeed: AnimationSpeed
  eventDate?: string
  eventLocation?: string
  clientName: string
  studioName: string
  studioWebsite?: string
  headingFont?: string
  bodyFont?: string
  isPrivate: boolean
  showFindButton: boolean
  lang: Lang
  onEnter: () => void
  onFindMyPhotos: () => void
}) {
  const wsTxt = t(lang)
  const isMinimal = style === 'minimal'
  const isCinematic = style === 'cinematic'
  const studioText = 'm-0 mb-5 text-[10px] font-medium tracking-[0.22em] uppercase'

  return (
    <div className={cn('relative z-2 px-6 text-center', isMinimal ? 'max-w-[800px]' : 'max-w-[680px]')}>
      {studioName && (
        <div className={fadeUp.studio}>
          {studioWebsite ? (
            <a
              href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank" rel="noopener noreferrer"
              className={cn(studioText, 'inline-block text-white/40 no-underline transition-colors duration-200 hover:text-white/80')}
              onClick={e => e.stopPropagation()}
            >{studioName}</a>
          ) : (
            <p className={cn(studioText, 'text-white/30')}>{studioName}</p>
          )}
        </div>
      )}

      <div className={TITLE_ENTRANCE[style]}>
        <h1
          className={cn(
            'm-0 text-white',
            isMinimal
              ? 'text-[clamp(40px,9vw,88px)] leading-[1.02] font-extrabold tracking-[0.04em] uppercase'
              : 'text-[clamp(32px,7vw,68px)] leading-[1.08] font-bold tracking-[-0.025em]',
            isCinematic && 'text-shadow-[0_4px_60px_var(--color-black)]/70',
            style === 'mosaic' && 'text-shadow-[0_2px_40px_var(--color-black)]/50',
          )}
          style={headingFont ? { fontFamily: fontFamilyCss(headingFont) } : undefined}
        >{galleryTitle}</h1>
      </div>

      {clientName && (
        <div className={fadeUp.client}>
          <p
            className={cn(
              'font-normal',
              isMinimal
                ? 'mt-4 text-[clamp(12px,1.5vw,15px)] tracking-[0.15em] text-white/35 uppercase'
                : 'mt-2.5 text-[clamp(14px,2vw,19px)] tracking-[0.01em] text-white/45',
            )}
            style={bodyFont ? { fontFamily: fontFamilyCss(bodyFont) } : undefined}
          >{clientName}</p>
        </div>
      )}

      {/* Falls back to the description so the photographer's line still animates. */}
      <OpeningText message={welcomeMessage || galleryDescription} animation={textAnimation} speed={animationSpeed} marginTop={24} />

      {(eventDate || eventLocation) && (
        <div className={fadeUp.meta}>
          <p className="mt-2.5 flex items-center justify-center gap-2 text-[12px] tracking-[0.03em] text-white/25">
            {eventDate && <span>{eventDate}</span>}
            {eventDate && eventLocation && <span className="opacity-30">{isMinimal ? '|' : '·'}</span>}
            {eventLocation && <span>{eventLocation}</span>}
          </p>
        </div>
      )}

      {/* Only when the animated line above is a dedicated welcome message. */}
      {galleryDescription && welcomeMessage && (
        <div className={fadeUp.description}>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-white/50 text-shadow-[0_1px_8px_var(--color-black)]/50">
            {galleryDescription}
          </p>
        </div>
      )}

      {isPrivate && (
        <div className={cn(fadeUp.privacy, 'mt-5')}>
          <div className={cn('inline-flex items-center gap-2 border border-brand/12 bg-brand/6 px-[18px] py-2', !isMinimal && 'rounded-[20px]')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-[wcFloat_2.5s_ease-in-out_infinite] text-brand/55">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[11px] font-normal text-white/35">
              {wsTxt.privacyModeBadge}
            </span>
          </div>
        </div>
      )}

      <div
        className="mt-8 flex flex-wrap justify-center gap-3.5"
        style={{ animation: `wcFadeUp .9s cubic-bezier(.16,1,.3,1) ${buttonsDelay(welcomeMessage || galleryDescription)}s both` }}
      >
        {!isPrivate && (
          <button
            onClick={onEnter}
            className={cn(
              'border text-white transition-all duration-300 hover:scale-[1.03] hover:border-white/35',
              isMinimal
                ? 'border-white/25 bg-transparent px-12 py-3.5 text-[11px] font-medium tracking-[0.18em] uppercase hover:bg-white/8'
                : 'rounded-[50px] border-white/18 bg-white/7 px-11 py-[15px] text-[15px] font-semibold tracking-[0.01em] backdrop-blur-[20px] hover:bg-white/16',
            )}
          >{wsTxt.viewGallery}</button>
        )}

        {showFindButton && (
          <button
            onClick={onFindMyPhotos}
            className={cn(
              'relative z-10 flex items-center gap-2.5 bg-linear-135/srgb from-brand to-brand-violet text-[15px] font-bold tracking-[0.01em] text-white transition-all duration-300 hover:scale-105',
              isPrivate ? 'animate-[wcGlow_3s_ease-in-out_infinite] px-12 py-4' : 'px-9 py-[15px]',
              !isMinimal && 'rounded-[50px]',
            )}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
            {wsTxt.findMyPhotos}
          </button>
        )}
      </div>
    </div>
  )
}
