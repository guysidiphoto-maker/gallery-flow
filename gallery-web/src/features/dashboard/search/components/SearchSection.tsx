import type { ReactNode } from 'react'

export function SearchSection({ title, count, note, children }: {
  title: string
  count: number
  note?: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
          {title}
        </h3>
        <span className="text-xs text-muted">{count}</span>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
