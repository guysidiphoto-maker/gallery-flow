import type React from 'react'
import { Eyebrow } from '@/shared/ui'

// Eyebrow + hairline-topped list shared by every activity list.
export function ActivitySection({ eyebrow, className = 'mb-8', children }: {
  eyebrow: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={className}>
      <Eyebrow className="mb-3 block text-[9px] font-medium">{eyebrow}</Eyebrow>
      <div className="border-t border-line">
        {children}
      </div>
    </section>
  )
}

export const activityRowClass = 'flex items-center gap-3 border-b border-line px-1 py-3 text-[13px] text-ink'
export const activityTimeClass = 'min-w-[110px] text-left text-[12px] text-muted tabular-nums lining-nums'
export const activityTagClass = 'text-[10px] font-medium tracking-label uppercase'
export const truncateLtrEnd = 'flex-1 truncate text-right [direction:ltr]'

export function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
