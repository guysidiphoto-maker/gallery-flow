import type { ReactNode } from 'react'

/** Label + control + inline error message. */
export function LeadField({ label, error, className = 'mb-4', children }: {
  label: ReactNode
  error?: string | false
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[13px] text-white/50">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-[12px] text-(--ec-error)">{error}</p>}
    </div>
  )
}
