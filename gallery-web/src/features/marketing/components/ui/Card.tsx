import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Soft resting shadow. */
  elevated?: boolean
  /** Hover lift, for clickable-looking cards. */
  interactive?: boolean
}

/** Raised editorial panel (24px padding unless overridden). `pf-card` is a ScanHUD target. */
export function Card({ elevated, interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'pf-card rounded-[18px] border border-(--mk-border) bg-(--mk-surface) p-6',
        'transition-[translate,box-shadow,border-color] duration-200 ease-out-expo',
        elevated && 'shadow-card',
        interactive && 'hover:-translate-y-0.5 hover:shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
