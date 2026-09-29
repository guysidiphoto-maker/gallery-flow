import type React from 'react'

// Inline single-row progress strip shared by the Photos and Stories tabs.
export function UploadProgressStrip({ label, aside, pct }: {
  label: React.ReactNode
  aside?: React.ReactNode
  pct: number
}) {
  return (
    <div className="mb-5 border border-line bg-surface px-[18px] py-3.5">
      <div className="mb-2 flex items-center justify-between text-[12px] font-medium tracking-[0.04em] text-ink">
        {label}
        {aside}
      </div>
      <div className="h-0.5 w-full overflow-hidden bg-line">
        <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
