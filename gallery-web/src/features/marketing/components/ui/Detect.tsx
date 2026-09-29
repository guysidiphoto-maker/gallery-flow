import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '@/shared/ui'
import { useInView } from './useInView'

export interface DetectProps extends HTMLAttributes<HTMLDivElement> {
  delay?: number
  y?: number
}

// Physical corners on purpose: the brackets frame the box, not the reading direction.
const CORNERS = [
  '-top-[7px] -left-[7px] border-t-2 border-l-2 rounded-tl-[5px]',
  '-top-[7px] -right-[7px] border-t-2 border-r-2 rounded-tr-[5px]',
  '-bottom-[7px] -left-[7px] border-b-2 border-l-2 rounded-bl-[5px]',
  '-bottom-[7px] -right-[7px] border-b-2 border-r-2 rounded-br-[5px]',
]

/** Reveal plus face-detection brackets that snap onto the corners on entry. */
export function Detect({ delay = 0, y = 24, className, style, children, ...rest }: DetectProps) {
  const [ref, on] = useInView<HTMLDivElement>(0.18)
  return (
    <div
      ref={ref}
      className={cn(
        'relative transition-[opacity,translate] duration-700 ease-out-expo will-change-[opacity,transform]',
        !on && 'translate-y-(--mk-rise) opacity-0',
        className,
      )}
      style={{ '--mk-rise': `${y}px`, transitionDelay: `${delay}ms`, ...style } as CSSProperties}
      {...rest}
    >
      {children}
      {CORNERS.map(pos => (
        <span
          key={pos}
          aria-hidden
          className={cn(
            'pointer-events-none absolute size-4 border-sage transition-[opacity,scale] duration-[450ms] ease-out-expo',
            on ? 'opacity-65' : 'scale-140 opacity-0',
            pos,
          )}
          style={{ transitionDelay: `${delay + 160}ms` }}
        />
      ))}
    </div>
  )
}
