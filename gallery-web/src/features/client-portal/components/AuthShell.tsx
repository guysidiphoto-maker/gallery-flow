import type { ReactNode } from 'react'
import { CenteredCard } from './CenteredCard'

/** Card layout shared by the client login and invitation pages. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <CenteredCard dir="rtl" outerClassName="p-5" className="w-full px-9 py-11">
      {children}
      <div className="mt-8 text-[10px] font-medium tracking-label text-muted uppercase">Powered by Pixflow</div>
    </CenteredCard>
  )
}
