import { cn } from '@/shared/ui'

// Shared class recipes for the dark English landing. `ease-[ease]` keeps the
// CSS-default timing the original transitions used.

export const container = 'mx-auto max-w-[1200px] px-6 max-sm:px-4'
export const section = 'py-[110px] max-md:py-20'
export const sectionTitle = 'mb-4 text-center text-[2.4rem] font-bold tracking-[-0.02em] max-md:text-[1.8rem]'
export const sectionSub = 'mb-12 text-center text-[1.1rem] text-white/50'
export const card = 'rounded-lg border border-white/6 bg-(--mk-night-card)'
export const windowFrame = 'overflow-hidden rounded-[12px] border border-white/6 bg-(--mk-night-card)'
export const windowBar = 'flex gap-1.5 border-b border-white/6 bg-white/3 px-3.5 py-2.5'
export const liftOnHover = 'transition-[transform,box-shadow] duration-300 ease-[ease] hover:[transform:translateY(-4px)] hover:shadow-(--mk-lift-shadow)'

interface BtnOpts {
  variant: 'primary' | 'ghost'
  lg?: boolean
  glow?: boolean
  className?: string
}

/** Pill-ish CTA used across the page (download, demo launcher, plan buttons). */
export function btn({ variant, lg, glow, className }: BtnOpts) {
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-8 py-3.5 text-[1rem] font-semibold no-underline',
    'transition-[transform,box-shadow,background] duration-200 ease-[ease] hover:[transform:translateY(-2px)]',
    variant === 'primary'
      ? 'bg-(image:--mk-brand-gradient) text-white'
      : 'border border-white/15 bg-transparent text-(--mk-night-ink) hover:bg-white/5',
    glow && 'shadow-(--mk-brand-glow) hover:shadow-(--mk-brand-glow-strong)',
    lg && 'px-[42px] py-[18px] text-[1.15rem]',
    className,
  )
}
