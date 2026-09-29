import { cn } from '@/shared/ui'

// Class recipes for the fullscreen demo. It is portalled to <body>, so it uses
// the body font and white text rather than the landing page's Inter.

export const sidebarBtn = (active?: boolean, className?: string) => cn(
  'block w-full cursor-pointer rounded-[8px] bg-transparent px-2.5 py-2 text-start text-[0.8rem] text-white/55',
  'transition-[background,color] duration-150 ease-[ease] max-md:whitespace-nowrap',
  active && 'bg-brand/12 text-(--mk-brand-pale)',
  'hover:bg-white/5 hover:text-white/90',
  className,
)

export const primaryBtn = (className?: string) => cn(
  'block w-full cursor-pointer rounded-[8px] bg-(image:--mk-brand-gradient) p-2.5 text-center text-[0.8rem] font-semibold text-white',
  'transition-transform duration-150 ease-[ease] hover:[transform:translateY(-1px)] disabled:cursor-default disabled:opacity-50',
  className,
)

export const chipBtn = (active: boolean, className?: string) => cn(
  'cursor-pointer rounded-sm border border-white/8 bg-white/5 px-3.5 py-1.5 text-[0.8rem] font-semibold text-white/50 transition-all duration-150 ease-[ease]',
  active && 'border-brand/40 bg-brand/15 text-(--mk-brand-pale)',
  'hover:bg-white/8 hover:text-white',
  className,
)

export const divider = 'my-1.5 h-px bg-white/6 max-md:mx-1 max-md:my-0 max-md:h-auto max-md:w-px'
export const overline = 'uppercase text-white/30'
