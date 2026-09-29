import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { FieldError } from './FieldError'

export function ConsentCheckbox({ checked, onChange, error, className, children }: {
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string | false
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label
        className={cn(
          'flex cursor-pointer items-start gap-2.5 text-[12px] leading-[1.6]',
          error ? 'text-(--q-error)' : 'text-(--q-consent)',
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
        <span>{children}</span>
      </label>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
