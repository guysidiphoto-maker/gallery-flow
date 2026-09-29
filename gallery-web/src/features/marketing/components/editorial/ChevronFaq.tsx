import { useState } from 'react'
import { cn } from '@/shared/ui'

// Static class per supported height so Tailwind can see it.
const OPEN_HEIGHT = { 200: 'max-h-[200px]', 240: 'max-h-[240px]' } as const

interface Props {
  q: string
  a: string
  openHeight?: keyof typeof OPEN_HEIGHT
}

/** Accordion row with a rotating chevron; the answer slides open. */
export function ChevronFaq({ q, a, openHeight = 200 }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-(--mk-border)">
      <button
        onClick={() => setOpen(!open)}
        className="mk-body flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent py-[18px] text-right font-(family-name:--mk-font-sans) font-semibold text-ink"
      >
        <span>{q}</span>
        <span className={cn('ms-2.5 shrink-0 text-[18px] text-muted transition-[rotate] duration-[250ms] ease-[ease]', open && 'rotate-90')}>‹</span>
      </button>
      <div className={cn('overflow-hidden transition-[max-height] duration-300 ease-[ease]', open ? OPEN_HEIGHT[openHeight] : 'max-h-0')}>
        <p className="mk-small pb-4 leading-[1.8] text-(--mk-ink-soft)">{a}</p>
      </div>
    </div>
  )
}
