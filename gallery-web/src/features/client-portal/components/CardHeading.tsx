import type { ReactNode } from 'react'
import { cn, Eyebrow } from '@/shared/ui'

/** Eyebrow + title + lead paragraph at the top of a CenteredCard. */
export function CardHeading({ eyebrow, title, lead, as: Tag = 'h2', leadClassName }: {
  eyebrow: ReactNode
  title: ReactNode
  lead?: ReactNode
  as?: 'h1' | 'h2'
  leadClassName?: string
}) {
  return (
    <>
      <Eyebrow className="mb-[18px] block">{eyebrow}</Eyebrow>
      <Tag className="mb-3 text-[26px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">{title}</Tag>
      {lead && <p className={cn('text-sm leading-[1.55] text-ink-soft', leadClassName)}>{lead}</p>}
    </>
  )
}
