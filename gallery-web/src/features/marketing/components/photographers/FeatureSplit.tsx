import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { Badge, Reveal } from '../ui'
import { Shot } from './Shot'

interface Props {
  badge: string
  title: ReactNode
  body: ReactNode
  shot: { src: string; alt: string }
  /** Tinted full-bleed band with the shot first; otherwise text first, wrapping in reverse. */
  tinted?: boolean
}

const ROW = 'mx-auto flex max-w-[1120px] items-center justify-center gap-12 px-[clamp(20px,5vw,56px)] py-16'

/** Screenshot beside a badge + headline + paragraph. */
export function FeatureSplit({ badge, title, body, shot, tinted }: Props) {
  const text = (
    <div className="max-w-[520px] flex-[1_1_380px]">
      <Reveal>
        <Badge>{badge}</Badge>
        <h2 className="mk-h1 mt-3">{title}</h2>
      </Reveal>
      <Reveal delay={90}>
        <p className="mk-body mt-4 max-w-[480px] text-[17px] leading-[1.8] text-(--mk-ink-soft)">{body}</p>
      </Reveal>
    </div>
  )
  const picture = (
    <div className="max-w-[500px] flex-[1_1_380px]">
      <Reveal><Shot src={shot.src} alt={shot.alt} /></Reveal>
    </div>
  )

  if (tinted) {
    return (
      <section className="bg-sunken">
        <div className={cn(ROW, 'flex-wrap')}>{picture}{text}</div>
      </section>
    )
  }
  return <section className={cn(ROW, 'flex-wrap-reverse')}>{text}{picture}</section>
}
