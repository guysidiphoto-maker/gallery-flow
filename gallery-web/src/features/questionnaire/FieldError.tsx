import type { ReactNode } from 'react'

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[12px] text-(--q-error)">{children}</p>
}
