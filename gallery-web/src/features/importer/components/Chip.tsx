import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'

export type ChipKind = 'ok' | 'warn' | 'danger' | 'neutral'

const KINDS: Record<ChipKind, string> = {
  ok: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-danger-strong/15 text-danger-strong',
  neutral: 'bg-night-muted/15 text-night-muted',
}

export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  return (
    <span className={cn('inline-block rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap', KINDS[kind])}>
      {children}
    </span>
  )
}
