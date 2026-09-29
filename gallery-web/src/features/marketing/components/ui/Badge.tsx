import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

/** Small sage pill for plan highlights and section tags. */
export function Badge({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[8px] border border-sage/40 bg-sage/14 px-2.5 py-1',
        'font-(family-name:--mk-font-sans) text-[12px] leading-[1.2] font-semibold text-sage',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
