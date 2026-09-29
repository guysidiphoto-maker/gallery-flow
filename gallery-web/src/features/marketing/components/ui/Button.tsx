import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-sage text-(--mk-surface) border-transparent',
  secondary: 'bg-transparent text-ink border-(--mk-border-strong)',
  ghost: 'bg-transparent text-ink border-transparent',
}

const SIZE: Record<Size, string> = {
  sm: 'px-[14px] py-[7px] text-[13px]',
  md: 'px-5 py-2.5 text-[14px]',
  lg: 'px-7 py-3.5 text-[15px]',
}

/** Editorial marketing button: sage primary, outlined secondary, text-only ghost. */
export function Button({ variant = 'primary', size = 'md', fullWidth, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border font-(family-name:--mk-font-sans) font-semibold tracking-[-0.01em]',
        'transition-[translate,background,border-color,opacity] duration-150 ease-out-expo',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage',
        'disabled:cursor-not-allowed disabled:opacity-50 enabled:active:translate-y-px',
        VARIANT[variant], SIZE[size], fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
