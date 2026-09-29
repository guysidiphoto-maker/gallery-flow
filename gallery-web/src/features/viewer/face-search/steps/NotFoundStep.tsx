import { cn } from '@/shared/ui'
import { FaceSearchButton } from '../FaceSearchButton'
import { RetryIcon } from '../RetryIcon'
import { dirClass, type FaceSearchLang, type FaceTexts } from '../faceSearchTexts'

interface Props {
  ft: FaceTexts
  lang: FaceSearchLang
  selfieUrl: string | null
  onBrowseAll: () => void
  onRetry: () => void
}

/** No match in an open gallery: tips + browse-all / retry. */
export function NotFoundStep({ ft, lang, selfieUrl, onBrowseAll, onRetry }: Props) {
  return (
    <div className="animate-[fse-fadeIn_.6s_cubic-bezier(.16,1,.3,1)_both]">
      {selfieUrl && (
        <div className="mx-auto mb-7 size-[90px] overflow-hidden rounded-full border-2 border-white/8 opacity-50 grayscale-40">
          <img src={selfieUrl} alt="" className="size-full object-cover" />
        </div>
      )}

      <h2 className={cn('mb-3 text-[24px] font-bold tracking-[-0.02em] text-white', dirClass(lang))}>
        {ft.noMatch}
      </h2>

      {/* Hebrew copy is intentionally fixed here in both languages (existing behavior). */}
      <p className={cn('mx-auto mb-3 max-w-[300px] text-[14px] leading-[1.7] text-white/38', dirClass(lang))}>
        לא הצלחנו למצוא אותך לפי הסלפי.
        <br />
        אפשר לנסות שוב עם תאורה טובה יותר, או לעבור על כל הגלריה.
      </p>

      <div className="mx-auto mb-7 flex max-w-[280px] flex-col gap-1.5 rounded-[14px] border border-white/5 bg-white/2 px-[18px] py-3.5">
        <div className={cn('mb-0.5 text-[11px] font-semibold text-white/30', dirClass(lang))}>
          {ft.tipsTitle}
        </div>
        {[ft.tip1, ft.tip2, ft.tip3].map((tip, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] text-white/30">
            <div className="size-1 shrink-0 rounded-full bg-brand/40" />
            {tip}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <FaceSearchButton variant="primary" onClick={onBrowseAll} className="w-full max-w-80 justify-center">
          {ft.browseAll}
        </FaceSearchButton>
        <FaceSearchButton variant="secondary" onClick={onRetry} className="w-full max-w-80 justify-center">
          <RetryIcon />
          {ft.tryAgain}
        </FaceSearchButton>
      </div>
    </div>
  )
}
