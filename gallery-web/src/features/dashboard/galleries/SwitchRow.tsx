import type React from 'react'
import { cn } from '@/shared/ui'

// Title + description with a charcoal switch knob; the whole row is the click target.
export function SwitchRow({ title, desc, on, onClick }: {
  title: React.ReactNode
  desc: React.ReactNode
  on: boolean
  onClick: () => void
}) {
  return (
    <div onClick={onClick} className="flex cursor-pointer items-center justify-between gap-3 select-none">
      <div>
        <span className="mb-1 block text-[13px] font-medium text-ink">
          {title}
        </span>
        <span className="text-xs leading-normal text-muted">
          {desc}
        </span>
      </div>
      {/* Knob slides with an explicit -x offset: the dashboard is always RTL. */}
      <div className={cn('relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200', on ? 'bg-ink' : 'bg-line')}>
        <div
          className={cn(
            'size-5 rounded-full bg-white shadow-[0_1px_3px] shadow-black/18 transition-transform duration-200',
            on ? '-translate-x-5' : 'translate-x-0',
          )}
        />
      </div>
    </div>
  )
}
