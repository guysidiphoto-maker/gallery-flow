import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { Button, Reveal } from '../ui'

interface Props {
  title: ReactNode
  label: string
  onClick: () => void
  /** Vertical padding of the section. */
  className: string
}

/** Closing display headline + one large CTA. */
export function FinalCta({ title, label, onClick, className }: Props) {
  return (
    <section className={cn('px-6 text-center', className)}>
      <Reveal>
        <h2 className="mk-display mb-6 text-[clamp(30px,5vw,56px)]">{title}</h2>
        <Button size="lg" onClick={onClick} className="px-10 py-4 text-[16px]">{label}</Button>
      </Reveal>
    </section>
  )
}
