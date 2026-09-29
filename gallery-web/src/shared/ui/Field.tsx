import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const control =
  'w-full rounded-hair border border-line bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-muted ' +
  'transition-colors outline-none focus:border-ink disabled:opacity-60 aria-invalid:border-danger-strong'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(control, 'min-h-24 resize-y leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn(control, 'cursor-pointer', className)} {...rest} />
  },
)

/** Label + control + optional hint/error, stacked. */
export function Field({ label, hint, error, children, className }: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-2', className)}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error ? <span className="text-xs font-medium text-danger-strong">{error}</span>
        : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

/** Small uppercase wide-tracked label — the editorial signature. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-eyebrow tracking-wide-label text-muted uppercase', className)}>{children}</span>
}
