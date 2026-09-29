import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'

export type BadgeTone = 'neutral' | 'live' | 'warn' | 'danger' | 'accent'

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-muted border-line bg-transparent',
  live: 'text-sage border-sage/50 bg-sage/8',
  warn: 'text-amber border-amber/50 bg-amber/7',
  danger: 'text-danger border-danger/50 bg-danger/6',
  accent: 'text-ink border-ink bg-transparent',
}

export function Badge({ children, tone = 'neutral', icon }: {
  children: ReactNode
  tone?: BadgeTone
  icon?: IconName
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] border px-2 py-[3px] text-[10px] font-medium tracking-[0.08em] whitespace-nowrap uppercase',
        TONES[tone],
      )}
    >
      {icon && <Icon name={icon} size={11} strokeWidth={1.7} />}
      {children}
    </span>
  )
}
