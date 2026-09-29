import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'

/** Small uppercase label above a brand-kit control. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 text-[10px] font-medium tracking-label text-muted uppercase', className)}>
      {children}
    </div>
  )
}
