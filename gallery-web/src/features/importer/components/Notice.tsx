import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { surfaceAlt, textMain } from './theme'

type Tone = 'info' | 'warn' | 'danger' | 'ok'

const TONES: Record<Tone, string> = {
  info: 'border-brand',
  warn: 'border-warning',
  danger: 'border-danger-strong',
  ok: 'border-success',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={cn(surfaceAlt, textMain, 'rounded-[8px] border-s-[3px] px-3.5 py-2.5 text-[13px] leading-[1.6]', TONES[tone])}>
      {children}
    </div>
  )
}
