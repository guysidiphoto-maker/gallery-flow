import { cn } from '@/shared/ui'
import { ViewerSpinner } from '../ViewerSpinner'

const centerPill =
  'fixed top-1/2 left-1/2 z-[9999] flex -translate-1/2 animate-[gv-fade-in_.2s_ease] items-center gap-3 rounded-[16px] bg-black/85 px-8 py-5 shadow-[0_8px_40px] shadow-black/50 backdrop-blur-[20px]'

/** Download feedback: amber notice toast, "saving" spinner, brief "saved" check. */
export function DownloadToasts({ isMobile, hdNotice, onDismissNotice, savingPhoto, photoSaved, savingLabel, savedLabel }: {
  isMobile: boolean
  hdNotice: string | null
  onDismissNotice: () => void
  savingPhoto: boolean
  photoSaved: boolean
  savingLabel: string
  savedLabel: string
}) {
  return (
    <>
      {hdNotice && (
        <div
          className={cn(
            'fixed left-1/2 z-[950] flex max-w-[360px] -translate-x-1/2 animate-[gv-fade-in_.25s_ease] items-start gap-2.5 rounded-[12px]',
            'border border-(--viewer-amber)/35 bg-(--viewer-amber-deep)/95 px-[18px] py-3 shadow-[0_8px_32px] shadow-black/40 backdrop-blur-[20px]',
            isMobile ? 'bottom-[100px]' : 'bottom-20',
          )}
        >
          <span className="text-[16px] leading-none text-(--viewer-amber)">⏳</span>
          <span className="flex-1 text-[12px] leading-[1.5] text-white/85">{hdNotice}</span>
          <button
            onClick={onDismissNotice}
            aria-label="Dismiss"
            className="bg-transparent p-0 text-[16px] leading-none text-white/45"
          >×</button>
        </div>
      )}

      {savingPhoto && (
        <div className={centerPill}>
          <ViewerSpinner className="size-5" />
          <span className="text-[14px] font-semibold text-white">{savingLabel}</span>
        </div>
      )}

      {photoSaved && !savingPhoto && (
        <div className={centerPill}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="text-(--viewer-success-soft)">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[14px] font-semibold text-white">{savedLabel}</span>
        </div>
      )}
    </>
  )
}
