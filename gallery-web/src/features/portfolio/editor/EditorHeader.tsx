import { useState } from 'react'
import { cn } from '@/shared/ui'
import { icons } from './icons'

const pill = 'flex items-center rounded-[10px] border py-[9px] text-xs font-semibold no-underline transition-all'
const pillIdle = 'border-white/8 bg-white/4 text-white/80'

export function EditorHeader({ publicUrl, saved, onSave }: { publicUrl: string; saved: boolean; onSave: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-6 flex items-center justify-between border-b border-white/6 pb-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.03em] text-white">
          <div className="flex size-8 items-center justify-center rounded-lg border border-(color:--accent)/[14.5%] bg-(color:--accent)/[8%] text-(color:--accent)">
            {icons.pen}
          </div>
          עורך האתר
        </h2>
        <p className="text-[13px] text-white/65">עצב את דף הפורטפוליו שלך</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          className={cn(
            pill,
            'gap-1.5 px-[18px] duration-250',
            copied ? 'border-(color:--pe-success)/20 bg-(color:--pe-success)/10 text-(color:--pe-success-soft)' : pillIdle,
          )}
        >
          {copied ? icons.copied : icons.copy}
          {copied ? 'הועתק' : 'העתק קישור'}
        </button>
        <a href={publicUrl} target="_blank" rel="noopener" className={cn(pill, pillIdle, 'gap-[5px] px-4 duration-200')}>
          {icons.external}
          פתח
        </a>
        <button
          onClick={onSave}
          className={cn(
            'flex items-center gap-1.5 rounded-[10px] px-6 py-[9px] text-[13px] font-bold text-white transition-all duration-250',
            saved
              ? 'animate-[pe-saved-pulse_.4s_ease] bg-[linear-gradient(135deg,var(--pe-success),var(--pe-success-soft))] shadow-[0_4px_16px_color-mix(in_srgb,var(--pe-success)_20%,transparent)]'
              : 'bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_87%,transparent))] shadow-[0_4px_16px_color-mix(in_srgb,var(--accent)_14.5%,transparent)]',
          )}
        >
          {saved && icons.saved}
          {saved ? 'נשמר' : 'שמור'}
        </button>
      </div>
    </div>
  )
}
