import type { ReactNode } from 'react'

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-canvas px-[clamp(16px,4vw,48px)] py-8 font-[system-ui,sans-serif] text-ink">
      <div className="mx-auto max-w-[1100px]">{children}</div>
    </div>
  )
}
