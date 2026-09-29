import type { ReactNode } from 'react'
import { cn } from './cn'

/** Accessible on/off switch (RTL-aware). */
export function Toggle({ checked, onChange, label, disabled, className }: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-ink' : 'bg-line',
        className,
      )}
    >
      <span
        className={cn(
          'block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-transform duration-200',
          checked && 'translate-x-5 rtl:-translate-x-5',
        )}
      />
    </button>
  )
}

/** Settings row: title + description on one side, toggle on the other. */
export function ToggleRow({ title, description, checked, onChange, className }: {
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  className?: string
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={cn('flex cursor-pointer items-center justify-between gap-4 border-b border-line py-3.5 select-none last:border-b-0', className)}
    >
      <div>
        <div className="mb-1 text-[13px] font-medium text-ink">{title}</div>
        {description && <div className="text-xs leading-normal text-muted">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}
