import { cn } from '@/shared/ui'

/** Rounded CTA used by every /demo phase (buttons and the final link). */
export function pill(primary: boolean, className?: string) {
  return cn(
    'inline-flex cursor-pointer items-center justify-center rounded-[50px] border-none px-10 py-3.5 text-[16px] font-semibold font-(family-name:--mk-font-inter-plain)',
    primary ? 'bg-(image:--mk-selfie-cta) text-white' : 'bg-white/8 text-white/70 backdrop-blur-[8px]',
    className,
  )
}
