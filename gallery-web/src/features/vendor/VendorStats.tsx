import { forwardRef } from 'react'
import { cn } from '@/shared/ui'

const CARD = 'flex-[1_1_100px] rounded-md border px-5 py-3.5'

export const VendorStats = forwardRef<HTMLDivElement, { tagged: number; events: number; selected: number }>(
  function VendorStats({ tagged, events, selected }, ref) {
    return (
      <div ref={ref} className="mb-8 flex flex-wrap gap-3">
        <div className={cn(CARD, 'border-brand/15 bg-brand/8')}>
          <div className="text-[22px] font-bold text-brand-soft">{tagged}</div>
          <div className="text-[11px] text-white/40">Tagged Photos</div>
        </div>
        <Stat value={events} label="Events" />
        <Stat value={selected} label="Selected" />
      </div>
    )
  },
)

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={cn(CARD, 'border-white/6 bg-white/2')}>
      <div className="text-[22px] font-bold">{value}</div>
      <div className="text-[11px] text-white/40">{label}</div>
    </div>
  )
}
