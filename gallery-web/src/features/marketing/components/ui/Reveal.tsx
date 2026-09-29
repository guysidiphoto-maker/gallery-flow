import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '@/shared/ui'
import { useInView } from './useInView'

export interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  /** ms — stagger within a group. */
  delay?: number
  /** px rise distance. */
  y?: number
}

/** Fades + rises its children in the first time they enter the viewport. */
export function Reveal({ delay = 0, y = 24, className, style, children, ...rest }: RevealProps) {
  const [ref, shown] = useInView<HTMLDivElement>(0.12)
  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,translate] duration-700 ease-out-expo will-change-[opacity,transform]',
        !shown && 'translate-y-(--mk-rise) opacity-0',
        className,
      )}
      style={{ '--mk-rise': `${y}px`, transitionDelay: `${delay}ms`, ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </div>
  )
}
