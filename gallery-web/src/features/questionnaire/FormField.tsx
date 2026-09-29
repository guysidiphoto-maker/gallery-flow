import type { ReactNode } from 'react'
import { FieldError } from './FieldError'

/** Label + control + inline error message. */
export function FormField({ label, error, children }: {
  label: ReactNode
  error?: string | false
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] text-(--q-muted)">{label}</label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
