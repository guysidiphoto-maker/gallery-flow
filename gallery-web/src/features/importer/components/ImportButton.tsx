import { Button, cn, type ButtonProps } from '@/shared/ui'

type Variant = 'primary' | 'ghost' | 'danger'

// Shared Button re-skinned for the dark wizard (sentence case, soft radius, brand accent).
const VARIANTS: Record<Variant, string> = {
  primary: 'border-transparent bg-brand text-white hover:bg-brand',
  ghost: 'border-night-line bg-transparent text-white/90 hover:border-night-line',
  danger: 'border-danger-strong bg-transparent text-danger-strong hover:bg-transparent hover:text-danger-strong',
}

export function ImportButton({ variant = 'primary', className, ...rest }: Omit<ButtonProps, 'variant' | 'size'> & {
  variant?: Variant
}) {
  return (
    <Button
      variant={variant}
      className={cn(
        'rounded-[8px] px-[18px] py-2.5 text-sm font-semibold tracking-normal normal-case',
        'transition-opacity disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}
