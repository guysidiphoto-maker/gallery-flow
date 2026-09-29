// Face-recognition motif for the static faces image: sage viewfinder corners and
// pulsing landmark nodes, echoing the desktop 3D rig.

import type { ReactNode } from 'react'

// Physical corners: the viewfinder frames the image, not the reading direction.
const CORNERS = [
  'top-3 left-3 border-t-[3px] border-l-[3px] rounded-tl-[10px]',
  'top-3 right-3 border-t-[3px] border-r-[3px] rounded-tr-[10px]',
  'bottom-3 left-3 border-b-[3px] border-l-[3px] rounded-bl-[10px]',
  'bottom-3 right-3 border-b-[3px] border-r-[3px] rounded-br-[10px]',
]

// Rough face-landmark positions (% of the frame) and pulse offsets.
const NODES = [
  { x: 44, y: 40, d: 0 },
  { x: 56, y: 40, d: 0.4 },
  { x: 50, y: 50, d: 0.8 },
  { x: 45, y: 60, d: 1.2 },
  { x: 55, y: 60, d: 1.6 },
]

export function FaceScanFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[18px]">
      {children}
      {CORNERS.map(c => (
        <div key={c} className={`pointer-events-none absolute size-[30px] border-sage opacity-90 ${c}`} />
      ))}
      {NODES.map((n, i) => (
        <span
          key={i}
          aria-hidden
          className="mk-scan-node pointer-events-none absolute size-2 rounded-full bg-sage shadow-[0_0_8px_var(--color-sage)]"
          style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${n.d}s` }}
        />
      ))}
      <span className="pointer-events-none absolute end-[14px] top-[14px] inline-flex items-center gap-1.5 rounded-full bg-sage/92 px-2.5 py-1 text-[11px] font-bold tracking-[0.02em] text-(--mk-surface)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        זוהה
      </span>
    </div>
  )
}
