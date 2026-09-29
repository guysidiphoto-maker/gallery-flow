import type { ReactNode } from 'react'

export function ImportPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-[12px] border border-night-line bg-night-raised p-5">{children}</div>
}
