import type { ReactNode } from 'react'
import { cn } from './cn'
import { Eyebrow } from './Field'

/** Bordered section on the surface color, with an optional eyebrow title. */
export function Panel({ eyebrow, children, className }: {
  eyebrow?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('border border-line bg-surface p-6 pb-4', className)}>
      {eyebrow && <Eyebrow className="mb-3 block text-[9px]">{eyebrow}</Eyebrow>}
      {children}
    </section>
  )
}

/** Eyebrow + heading block used at the top of pages and tabs. */
export function PageHeading({ eyebrow, title, description, className }: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {eyebrow && <Eyebrow className="mb-2.5 block">{eyebrow}</Eyebrow>}
      <h2 className="text-[22px] font-medium tracking-tight text-ink">{title}</h2>
      {description && <p className="mt-1.5 text-[13px] leading-normal text-ink-soft">{description}</p>}
    </div>
  )
}
