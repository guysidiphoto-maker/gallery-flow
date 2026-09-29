import { cn } from '@/shared/ui'

/** Accent-tinted ring spinner used across the viewer's loading states. */
export function ViewerSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'size-7 rounded-full border-[2.5px] border-white/8 border-t-gallery-accent/70',
        'shadow-[0_0_16px_var(--color-gallery-accent)]/12',
        'animate-[gv-spin_.7s_cubic-bezier(.4,0,.2,1)_infinite] motion-reduce:animate-none motion-reduce:border-t-gallery-accent/90',
        className,
      )}
    />
  )
}
