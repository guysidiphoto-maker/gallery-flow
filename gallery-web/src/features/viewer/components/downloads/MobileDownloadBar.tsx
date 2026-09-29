import { DownloadIcon } from '../DownloadIcon'

/** Floating "save all" bar on phones, with a device-specific hint. */
export function MobileDownloadBar({ hint, buttonLabel, disabled, onSaveAll }: {
  hint: string
  buttonLabel: string
  disabled: boolean
  onSaveAll: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-800 flex animate-[gv-fade-in_.3s_ease] items-center gap-2.5 border-t border-white/6 bg-night/92 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[24px]">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[11px] leading-[1.4] text-white/35">{hint}</p>
      </div>
      <button
        onClick={onSaveAll}
        disabled={disabled}
        className="gv-mobile-save flex shrink-0 items-center gap-[7px] rounded-[10px] px-[22px] py-2.5 text-[13px] font-bold whitespace-nowrap text-white shadow-[0_2px_12px] shadow-brand/25 transition-all duration-200 ease-[ease]"
      >
        <DownloadIcon size={14} strokeWidth={2.2} />
        {buttonLabel}
      </button>
    </div>
  )
}
