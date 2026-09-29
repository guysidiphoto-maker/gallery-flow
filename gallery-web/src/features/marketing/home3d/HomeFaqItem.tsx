import { useState } from 'react'
import { cn } from '@/shared/ui'

export function HomeFaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-(--mk-border)">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="mk-body flex w-full cursor-pointer items-center justify-between gap-4 border-none bg-none py-[18px] text-start font-(family-name:--mk-font-sans) font-semibold text-ink"
      >
        <span>{q}</span>
        <span className={cn('shrink-0 text-[20px] leading-none text-sage transition-[rotate] duration-[250ms] ease-[ease]', open && 'rotate-45')}>+</span>
      </button>
      {open && <p className="mk-body mb-[18px] max-w-[620px] leading-[1.62] text-(--mk-ink-soft)">{a}</p>}
    </div>
  )
}
