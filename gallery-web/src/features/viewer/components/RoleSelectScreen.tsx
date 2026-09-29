import { useState } from 'react'
import { cn } from '@/shared/ui'
import type { t } from '@/shared/i18n/viewerStrings'

/** Client-selection galleries: guest browsing, or client mode behind the gallery's client code. */
export function RoleSelectScreen({
  txt, studioName, galleryTitle, codeInput, codeError, onGuest, onCodeChange, onCodeSubmit,
}: {
  txt: ReturnType<typeof t>
  studioName: string
  galleryTitle: string
  codeInput: string
  codeError: boolean
  onGuest: () => void
  onCodeChange: (value: string) => void
  onCodeSubmit: () => void
}) {
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const choice = 'rounded-[10px] px-9 py-3.5 text-[14px] text-white transition-all duration-200'

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-night font-(family-name:--viewer-system-font)">
      {studioName && (
        <p className="mb-2 text-[11px] tracking-[0.15em] text-white/40 uppercase">{studioName}</p>
      )}
      <h2 className="mb-2 text-[24px] font-bold text-white">{galleryTitle}</h2>
      <p className="mb-9 text-[14px] text-white/40">{txt.howToView}</p>

      <div className="mb-6 flex gap-3.5">
        <button onClick={onGuest} className={cn(choice, 'border border-white/15 bg-white/5 font-medium hover:bg-white/10')}>
          {txt.guest}
        </button>
        <button
          onClick={() => setShowCodeEntry(true)}
          className={cn(choice, 'bg-linear-135/srgb from-brand to-brand-violet font-semibold shadow-[0_4px_20px] shadow-brand/30 hover:opacity-90')}
        >
          {txt.imTheClient}
        </button>
      </div>

      <div id="client-code-section" className={cn('text-center', showCodeEntry ? 'block' : 'hidden')}>
        <p className="mb-2.5 text-[12px] text-white/50">{txt.enterClientCode}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={codeInput}
            onChange={e => onCodeChange(e.target.value)}
            placeholder="CODE"
            className={cn(
              'w-40 rounded-[8px] border bg-white/6 px-3.5 py-2.5 text-center text-[14px] tracking-[0.1em] text-white outline-none',
              codeError ? 'border-(--viewer-danger)' : 'border-white/15',
            )}
            onKeyDown={e => { if (e.key === 'Enter') onCodeSubmit() }}
            autoFocus
          />
          <button onClick={onCodeSubmit} className="rounded-[8px] bg-brand px-5 py-2.5 text-[13px] font-semibold text-white">
            {txt.enter}
          </button>
        </div>
        {codeError && <p className="mt-1.5 text-[11px] text-(--viewer-danger)">{txt.invalidCode}</p>}
      </div>
    </div>
  )
}
