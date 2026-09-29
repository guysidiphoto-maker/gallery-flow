import { cn } from '@/shared/ui'
import { btn, card } from './classes'
import { DOWNLOAD_URL } from './copy'

interface Props {
  name: string
  price: string
  per?: string
  features: readonly string[]
  cta: string
  cancel?: string
  badge?: string
}

/** One plan column; `badge` marks the highlighted (popular) plan. */
export function PlanCard({ name, price, per, features, cta, cancel, badge }: Props) {
  const popular = !!badge
  return (
    <div
      className={cn(
        card, 'relative px-7 py-8 transition-[transform,box-shadow] duration-300 ease-[ease]',
        'hover:[transform:translateY(-4px)] hover:shadow-(--mk-lift-shadow)',
        popular && 'border-brand shadow-(--mk-lp-popular-shadow) transition-[transform,box-shadow,border-color] hover:border-brand-soft hover:shadow-(--mk-lp-popular-shadow-hover)',
      )}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 animate-[mk-lp-badge-pulse_2.5s_ease-in-out_infinite] whitespace-nowrap rounded-[10px] bg-(image:--mk-brand-gradient) px-3.5 py-1 text-[0.75rem] font-bold text-white [transform:translateX(-50%)]">
          {badge}
        </span>
      )}
      <h3 className="mb-2 text-[1.2rem] font-bold">{name}</h3>
      <div className="mb-5 text-[2.5rem] font-extrabold tracking-[-0.02em]">
        {price}
        {per && <span className="text-[1rem] font-normal text-white/50">{per}</span>}
      </div>
      <ul className="mb-6 list-none p-0">
        {features.map((f, i) => (
          <li key={i} className="border-b border-white/4 py-2 text-[0.9rem] text-white/70 before:me-2.5 before:font-semibold before:text-brand-soft before:content-['✓']">
            {f}
          </li>
        ))}
      </ul>
      <a href={DOWNLOAD_URL} className={btn({ variant: popular ? 'primary' : 'ghost', glow: popular, className: 'w-full text-center' })}>
        {cta}
      </a>
      {cancel && <p className="mt-3 text-center text-[0.8rem] text-white/50">{cancel}</p>}
    </div>
  )
}
