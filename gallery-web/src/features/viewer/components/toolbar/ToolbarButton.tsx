import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

type Variant = 'default' | 'active' | 'primary' | 'ghost'

const VARIANT: Record<Variant, string> = {
  default: '',
  active:
    'border-gallery-accent/50 bg-gallery-accent/10 text-(--viewer-indigo-soft) shadow-[0_0_12px_var(--color-gallery-accent)]/8',
  primary:
    'border-gallery-accent/85 bg-gallery-accent/85 font-semibold text-white shadow-[0_2px_10px_var(--color-gallery-accent)]/20 ' +
    'hover:border-gallery-accent hover:bg-gallery-accent hover:text-white hover:shadow-[0_4px_16px_var(--color-gallery-accent)]/30',
  ghost: 'border-transparent text-white/62 hover:border-transparent hover:bg-white/4 hover:text-white/70',
}

export function ToolbarButton({ variant = 'default', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-transparent px-[15px] py-[7px] text-[12px] font-medium tracking-[0.01em] whitespace-nowrap text-white/65 transition-all duration-200 ease-[ease]',
        'hover:-translate-y-[0.5px] hover:border-white/20 hover:bg-white/6 hover:text-white active:translate-y-0 disabled:cursor-wait disabled:opacity-50',
        'max-[641px]:min-h-9 max-[641px]:shrink-0 max-[641px]:px-3.5 max-[641px]:py-2 max-[641px]:text-[11.5px]',
        VARIANT[variant],
        className,
      )}
    />
  )
}
