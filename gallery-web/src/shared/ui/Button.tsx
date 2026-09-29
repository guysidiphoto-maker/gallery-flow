import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white border border-ink hover:bg-black',
  secondary: 'bg-transparent text-ink border border-ink hover:bg-ink hover:text-white',
  ghost: 'bg-transparent text-ink border border-line hover:border-ink',
  danger: 'bg-transparent text-danger border border-danger hover:bg-danger hover:text-white',
  link: 'bg-transparent text-muted underline-offset-4 hover:text-ink hover:underline',
}
const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[10px]',
  md: 'px-5 py-2.5 text-eyebrow',
  lg: 'px-7 py-3.5 text-xs',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

/** Editorial button: uppercase, wide-tracked, hairline radius. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-hair font-medium tracking-label uppercase',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        variant !== 'link' && SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-3 border-[1.5px]" />}
      {children}
    </button>
  )
})

/** Small inline spinner that inherits the current text color. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  )
}
