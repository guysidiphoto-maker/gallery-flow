import type { CSSProperties } from 'react'
import { cn } from '@/shared/ui'
import { ViewerSpinner } from '../ViewerSpinner'

/** Floating batch-download progress (label, percent, bar). */
export function DownloadProgress({ isMobile, label, current, total }: {
  isMobile: boolean
  label: string | null
  current: number
  total: number
}) {
  const pct = (current / total) * 100
  return (
    <div
      className={cn(
        'fixed left-1/2 z-900 flex min-w-[220px] -translate-x-1/2 animate-[gv-fade-in_.25s_ease] flex-col items-center gap-2 rounded-[14px]',
        'border border-white/10 bg-night/92 px-6 py-3 shadow-[0_8px_32px] shadow-black/40 backdrop-blur-[20px]',
        isMobile ? 'bottom-20' : 'bottom-6',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <ViewerSpinner className="size-4 border-2" />
        <span className="flex-1 text-[12px] font-medium text-white/70">{label}</span>
        <span className="text-[11px] text-white/35 tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-[2px] bg-white/8">
        <div
          className="gv-progress-fill h-full w-(--pct) rounded-[2px] transition-[width] duration-300 ease-[ease]"
          style={{ '--pct': `${pct}%` } as CSSProperties}
        />
      </div>
    </div>
  )
}
