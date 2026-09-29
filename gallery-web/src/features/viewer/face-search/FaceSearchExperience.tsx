import { cn } from '@/shared/ui'
import './faceSearch.css'
import { faceTexts } from './faceSearchTexts'
import type { ServerImageRow } from './serverImageRow'
import { useFaceSearch } from './useFaceSearch'
import { WelcomeStep } from './steps/WelcomeStep'
import { CameraStep } from './steps/CameraStep'
import { ThinkingStep } from './steps/ThinkingStep'
import { FoundStep } from './steps/FoundStep'
import { NotFoundStep } from './steps/NotFoundStep'
import { NotFoundPrivateStep } from './steps/NotFoundPrivateStep'

interface FaceSearchExperienceProps {
  galleryId: string
  /** Gallery images for the blurred background */
  backgroundImages: Array<{ thumbnail_path: string | null; storage_path: string }>
  storageUrl: (path: string) => string
  /** Decides the not-found screen (private galleries have nothing else to browse). */
  privacyMode: 'open' | 'private'
  lang?: 'en' | 'he'
  /** In private mode the parent has no other image rows, so it adopts `images` as its state. */
  onMatches: (imageIds: string[], images: ServerImageRow[]) => void
  onBrowseAll: () => void
  onClose: () => void
  onSelfieCapture?: (url: string) => void
}

export function FaceSearchExperience({
  galleryId,
  backgroundImages,
  storageUrl,
  privacyMode,
  lang = 'he',
  onMatches,
  onBrowseAll,
  onClose,
  onSelfieCapture,
}: FaceSearchExperienceProps) {
  const ft = faceTexts[lang] || faceTexts.he
  const fs = useFaceSearch({ galleryId, privacyMode, lang, onSelfieCapture })
  const { phase, selfieUrl } = fs

  const bgSrc = backgroundImages.length > 0
    ? storageUrl(backgroundImages[0].thumbnail_path || backgroundImages[0].storage_path)
    : null

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col items-center justify-center overflow-hidden bg-black font-(family-name:--fs-font) antialiased">
      {bgSrc && (
        <div
          className={cn(
            'absolute -inset-5 bg-cover bg-center blur-[50px] brightness-30 saturate-50 transition-opacity duration-1200 ease-[cubic-bezier(.4,0,.2,1)]',
            phase === 'thinking' ? 'opacity-50' : 'opacity-30',
          )}
          style={{ backgroundImage: `url(${bgSrc})` }}
        />
      )}

      <div className="absolute inset-0 bg-radial/srgb from-black/35 to-black/85" />

      {phase !== 'thinking' && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 z-10 flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/8 bg-white/6 text-[18px] leading-none text-white/50 backdrop-blur-[12px] transition-all duration-250 ease-[cubic-bezier(.4,0,.2,1)] hover:scale-[1.08] hover:bg-white/12 hover:text-white/80"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <div
        className={cn(
          'relative z-[2] w-full max-w-[480px] px-7 text-center transition-opacity duration-450 ease-[cubic-bezier(.4,0,.2,1)]',
          fs.fadeOut ? 'opacity-0' : 'opacity-100',
        )}
      >
        {phase === 'welcome' && <WelcomeStep ft={ft} lang={lang} onStart={() => fs.setPhase('camera')} />}
        {phase === 'camera' && (
          <CameraStep
            ft={ft}
            lang={lang}
            videoRef={fs.videoRef}
            onCapture={fs.captureSelfie}
            onUpload={() => fs.fileInputRef.current?.click()}
          />
        )}
        {phase === 'thinking' && <ThinkingStep lang={lang} selfieUrl={selfieUrl} visibleLines={fs.visibleLines} />}
        {phase === 'found' && (
          <FoundStep
            ft={ft}
            lang={lang}
            selfieUrl={selfieUrl}
            matchCount={fs.matchCount}
            onViewPhotos={() => onMatches(fs.matchIds, fs.matchImages)}
          />
        )}
        {phase === 'not-found' && (
          <NotFoundStep ft={ft} lang={lang} selfieUrl={selfieUrl} onBrowseAll={onBrowseAll} onRetry={fs.retry} />
        )}
        {phase === 'not-found-private' && <NotFoundPrivateStep ft={ft} lang={lang} onRetry={fs.retry} />}
      </div>

      <canvas ref={fs.canvasRef} className="hidden" />
      {/* No `capture` attribute: it forced the front camera and made "Upload" open another selfie. */}
      <input
        ref={fs.fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={fs.onFileChange}
        className="hidden"
      />
    </div>
  )
}
