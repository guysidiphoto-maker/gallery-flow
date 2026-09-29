import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { card } from './classes'
import { FadeUp } from './FadeUp'

export interface Feature { icon: ReactNode; t: string; d: string }

const featureCard = cn(
  card,
  'group relative overflow-hidden px-6 py-8',
  'transition-[transform,box-shadow] duration-200 ease-[ease] hover:[transform:translateY(-8px)] hover:shadow-(--mk-lp-feature-shadow)',
  // Gradient hairline that lights up along the top edge on hover.
  'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-(image:--mk-lp-feature-bar) before:opacity-0',
  'before:transition-opacity before:duration-200 before:ease-[ease] hover:before:opacity-100',
)

/** 3-up grid of icon cards, staggered in. */
export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="mt-12 grid grid-cols-[repeat(3,1fr)] gap-6 px-0 max-lg:grid-cols-[repeat(2,1fr)] max-md:grid-cols-[1fr]">
      {features.map((f, i) => (
        <FadeUp className={featureCard} key={i} delay={i * 80}>
          <div className="mb-4 text-brand-soft transition-[transform,color] duration-200 ease-[ease] group-hover:text-(--mk-brand-pale) group-hover:[transform:scale(1.15)]">
            {f.icon}
          </div>
          <h3 className="mb-2 text-[1.1rem] font-bold">{f.t}</h3>
          <p className="text-[0.93rem] text-white/50">{f.d}</p>
        </FadeUp>
      ))}
    </div>
  )
}
