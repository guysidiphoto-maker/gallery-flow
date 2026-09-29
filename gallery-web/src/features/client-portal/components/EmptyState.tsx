import type { ReactNode } from 'react'
import { Eyebrow } from '@/shared/ui'

interface Props {
  eyebrow?: string
  title: string
  body?: string
  icon?: ReactNode
  action?: ReactNode
}

/** Warm editorial empty state — never a cold "no data" line. */
export function EmptyState({ eyebrow, title, body, icon, action }: Props) {
  return (
    <div className="mx-auto max-w-[520px] rounded-[4px] border border-line-soft bg-surface px-8 py-16 text-center">
      {icon && <div className="mb-[18px] flex justify-center text-muted">{icon}</div>}
      {eyebrow && <Eyebrow className="mb-3.5 block">{eyebrow}</Eyebrow>}
      <h3 className="mb-2.5 font-serif text-[22px] leading-[1.2] font-medium tracking-[-0.01em] text-ink">{title}</h3>
      {body && <p className="mx-auto max-w-[380px] text-sm leading-[1.6] text-ink-soft">{body}</p>}
      {action && <div className="mt-[22px]">{action}</div>}
    </div>
  )
}
