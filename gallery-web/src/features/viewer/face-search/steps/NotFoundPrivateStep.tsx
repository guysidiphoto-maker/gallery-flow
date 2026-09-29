import { cn } from '@/shared/ui'
import { FaceSearchButton } from '../FaceSearchButton'
import { RetryIcon } from '../RetryIcon'
import { dirClass, type FaceSearchLang, type FaceTexts } from '../faceSearchTexts'

interface Props {
  ft: FaceTexts
  lang: FaceSearchLang
  onRetry: () => void
}

/** No match in a private gallery: there is nothing else to browse, so only retry. */
export function NotFoundPrivateStep({ ft, lang, onRetry }: Props) {
  return (
    <div className="animate-[fse-fadeIn_.6s_cubic-bezier(.16,1,.3,1)_both]">
      <div className="mx-auto mb-7 flex size-[72px] items-center justify-center rounded-full border border-white/6 bg-white/3">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/30">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h2 className={cn('mb-3 text-[22px] font-bold tracking-[-0.02em] text-white', dirClass(lang))}>
        {ft.privateNoMatch}
      </h2>

      <p className={cn('mx-auto mb-8 max-w-[280px] text-sm leading-[1.7] text-white/32', dirClass(lang))}>
        {ft.privateNoMatchMsg}
      </p>

      <FaceSearchButton variant="secondary" onClick={onRetry} className="mb-5 w-full max-w-80 justify-center">
        <RetryIcon />
        {ft.retake}
      </FaceSearchButton>

      <p className={cn('text-xs leading-[1.6] text-white/20', dirClass(lang))}>
        {ft.talkToPhotographer}
      </p>
    </div>
  )
}
