import type { ReactNode } from 'react'
import { FieldLabel } from './FieldLabel'

/** Numbered section card: eyebrow, serif title, optional description. */
export function BrandKitCard({ eyebrow, title, description, children }: {
  eyebrow: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-hair border border-line bg-surface px-7 pt-7 pb-8">
      <FieldLabel className="tracking-wide-label">{eyebrow}</FieldLabel>
      <h2 className="font-display text-xl font-medium tracking-[-0.01em] text-ink">{title}</h2>
      {description
        ? <p className="mt-2 mb-6 text-[13px] leading-[1.7] text-muted">{description}</p>
        : <div className="h-6" />}
      {children}
    </section>
  )
}
