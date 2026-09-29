import type { ReactNode } from 'react'

export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-5 inline-flex items-center gap-2 bg-transparent py-1 text-[12.5px] text-muted"
    >
      {children}
    </button>
  )
}
