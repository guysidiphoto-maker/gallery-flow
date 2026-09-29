import { useState } from 'react'
import { cn } from '@/shared/ui'
import { icons } from './icons'

/**
 * Accordion row with an accent rule while open. Right-side/right-aligned in both
 * languages: the original [dir=rtl] rules also matched via <html dir="rtl">.
 */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn(
        'border-r-[3px] border-b border-b-white/6 pr-3 transition-[border-color] duration-300 ease-[ease]',
        open ? 'border-r-brand' : 'border-r-transparent',
      )}
    >
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-right text-[1rem] font-semibold text-(--mk-night-ink)"
        onClick={() => setOpen(o => !o)}
      >
        <span>{q}</span>
        <span className={cn('flex shrink-0 text-white/50 transition-transform duration-300 ease-[ease]', open && 'rotate-180')}>
          {icons.chevron}
        </span>
      </button>
      <div className={cn('overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]', open ? 'max-h-[200px]' : 'max-h-0')}>
        <div className="pb-5 text-[0.93rem] leading-[1.7] text-white/50">{a}</div>
      </div>
    </div>
  )
}
