import type { ReactNode } from 'react'

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-11">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium tracking-[0.16em] text-muted uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

