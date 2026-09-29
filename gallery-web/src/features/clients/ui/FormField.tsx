import type { ReactNode } from 'react'
import { Field } from '@/shared/ui'

/** Shared Field with the Clients Manager's required-asterisk and spacing. */
export function FormField({ label, required, hint, children }: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <Field
      className="mb-[18px]"
      hint={hint}
      label={<>{label}{required && <span className="text-danger"> *</span>}</>}
    >
      {children}
    </Field>
  )
}
