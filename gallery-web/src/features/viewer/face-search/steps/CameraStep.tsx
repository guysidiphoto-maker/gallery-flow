import type { RefObject } from 'react'
import { cn } from '@/shared/ui'
import { dirClass, type FaceSearchLang, type FaceTexts } from '../faceSearchTexts'

interface Props {
  ft: FaceTexts
  lang: FaceSearchLang
  videoRef: RefObject<HTMLVideoElement>
  onCapture: () => void
  onUpload: () => void
}

// Physical corners on purpose: the brackets frame a mirrored camera preview.
const CORNERS = [
  'top-[15%] left-[15%] border-t-2 border-l-2 rounded-tl-[4px]',
  'top-[15%] right-[15%] border-t-2 border-r-2 rounded-tr-[4px]',
  'bottom-[15%] left-[15%] border-b-2 border-l-2 rounded-bl-[4px]',
  'bottom-[15%] right-[15%] border-b-2 border-r-2 rounded-br-[4px]',
]

export function CameraStep({ ft, lang, videoRef, onCapture, onUpload }: Props) {
  return (
    <div className="animate-[fse-fadeIn_.5s_cubic-bezier(.16,1,.3,1)_both]">
      <p className={cn('mb-7 text-sm leading-[1.7] tracking-[.01em] text-white/45', dirClass(lang))}>
        {ft.cameraTip}
      </p>

      <div className="relative mx-auto mb-8 size-60 rounded-full">
        <div className="absolute -inset-2 animate-[fse-orbit_8s_linear_infinite] rounded-full border-[1.5px] border-dashed border-brand/20" />
        <div className="relative size-full overflow-hidden rounded-full border-3 border-brand/30 bg-night shadow-[0_0_40px_var(--color-brand)]/8 inset-shadow-[0_0_40px_var(--color-black)]/30">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="size-full -scale-x-100 object-cover"
          />
          <div className="pointer-events-none absolute inset-0 rounded-full">
            {CORNERS.map((pos, i) => (
              <div
                key={i}
                className={cn('absolute size-5 animate-[fse-viewfinderCorner_2s_ease-in-out_infinite] border-white/35', pos)}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-full inset-shadow-[0_0_40px_var(--color-black)]/40" />
        </div>
      </div>

      <button
        onClick={onCapture}
        className="relative mx-auto mb-5 flex size-[72px] cursor-pointer items-center justify-center rounded-full border-3 border-white/70 bg-transparent p-0 transition-all duration-200 ease-[cubic-bezier(.4,0,.2,1)] hover:scale-[1.06] hover:border-brand/80 hover:shadow-[0_0_24px_var(--color-brand)]/20"
        aria-label="Take selfie"
      >
        <div className="size-14 rounded-full bg-white transition-all duration-150" />
      </button>

      <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-white/30">
        <span className="inline-block h-px w-6 bg-white/10" />
        {ft.or}
        <span className="inline-block h-px w-6 bg-white/10" />
      </p>
      <button
        onClick={onUpload}
        className="cursor-pointer bg-transparent px-4 py-2 text-[13px] font-medium text-brand/55 transition-colors duration-200 hover:text-brand/85"
      >
        {ft.uploadPhoto}
      </button>
    </div>
  )
}
