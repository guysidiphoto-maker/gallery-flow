import type { ReactNode } from 'react'

/** Bordered list whose rows are separated by hairlines. */
export function RowList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border border-line [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
}
