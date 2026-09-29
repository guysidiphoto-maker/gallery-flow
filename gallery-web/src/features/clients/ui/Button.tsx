import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { Button as BaseButton, cn } from '@/shared/ui'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'

const VARIANT_MAP = {
  primary: 'primary',
  outline: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
} as const

/** Shared editorial Button tuned to the Clients Manager's slightly larger size; `busy` swaps the label. */
export function Button({
  children, onClick, type = 'button', variant = 'outline',
  disabled = false, busy = false, icon, className, title, autoFocus,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: Variant
  disabled?: boolean
  busy?: boolean
  icon?: IconName
  className?: string
  title?: string
  autoFocus?: boolean
}) {
  return (
    <BaseButton
      type={type}
      variant={VARIANT_MAP[variant]}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      autoFocus={autoFocus}
      className={cn(
        'px-5 py-[11px] text-xs tracking-[0.12em] whitespace-nowrap disabled:opacity-50',
        variant === 'ghost' && 'text-ink-soft',
        className,
      )}
    >
      {busy ? 'רגע…' : (<>{icon && <Icon name={icon} size={13} strokeWidth={1.8} />}{children}</>)}
    </BaseButton>
  )
}
