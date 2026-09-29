import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'

/** Full-screen cream canvas with one centered hairline card (gates, errors, auth forms). */
export function CenteredCard({ dir, className, outerClassName, children }: {
  dir?: 'rtl' | 'ltr'
  className?: string
  outerClassName?: string
  children: ReactNode
}) {
  return (
    <div dir={dir} className={cn('flex min-h-screen items-center justify-center bg-canvas text-ink', outerClassName)}>
      <div className={cn('max-w-[440px] border border-line bg-white px-10 py-12 text-center', className)}>
        {children}
      </div>
    </div>
  )
}
