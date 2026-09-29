import { cn } from './cn'
import { Spinner } from './Button'

/** Full-screen centered spinner with an optional label. */
export function PageLoader({ label, className, dir }: { label?: string; className?: string; dir?: 'rtl' | 'ltr' }) {
  return (
    <div dir={dir} className={cn('flex min-h-screen items-center justify-center bg-canvas', className)}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="size-9 border-line border-t-ink" />
        {label && <p className="text-eyebrow tracking-label text-muted uppercase">{label}</p>}
      </div>
    </div>
  )
}
