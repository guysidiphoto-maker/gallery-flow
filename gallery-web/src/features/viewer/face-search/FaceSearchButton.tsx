import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

type Variant = 'primary' | 'success' | 'secondary'

const base =
  'relative inline-flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-[50px] px-10 py-4 ' +
  'text-[15px] font-bold tracking-[.01em] transition-[translate,scale,box-shadow] duration-250 ' +
  'ease-[cubic-bezier(.4,0,.2,1)] active:scale-[.97]! ' +
  // Soft sheen that fades in on hover.
  "after:absolute after:inset-0 after:bg-linear-135/srgb after:from-white/15 after:to-transparent after:to-60% " +
  'after:opacity-0 after:transition-opacity after:duration-250 hover:after:opacity-100'

const variants: Record<Variant, string> = {
  primary:
    'bg-linear-135/srgb from-brand to-brand-violet text-white shadow-[0_4px_20px_var(--color-brand)]/20 ' +
    'hover:-translate-y-px hover:scale-[1.02] hover:shadow-[0_8px_36px_var(--color-brand)]/35',
  success:
    'bg-linear-135/srgb from-(--fs-emerald) to-(--fs-emerald-soft) text-white shadow-[0_4px_20px_var(--fs-emerald)]/25 ' +
    'hover:-translate-y-px hover:scale-[1.02] hover:shadow-[0_8px_36px_var(--fs-emerald)]/35',
  secondary:
    'border border-white/10 bg-white/6 text-white/80 backdrop-blur-[8px] ' +
    'hover:-translate-y-px hover:scale-[1.01] hover:border-white/18 hover:bg-white/12',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
}

export function FaceSearchButton({ variant, className, ...rest }: Props) {
  return <button {...rest} className={cn(base, variants[variant], className)} />
}
