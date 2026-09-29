import { cn } from '@/shared/ui'

export function NavPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-[9px] text-[12.5px] tracking-[0.005em] whitespace-nowrap transition-all duration-200 ease-[ease]',
        'hover:bg-white/5 hover:text-white/90 max-[641px]:min-h-9 max-[641px]:px-3.5 max-[641px]:py-2 max-[641px]:text-[12px]',
        active
          ? 'border-white/15 bg-white/11 font-semibold text-white shadow-[0_1px_3px] shadow-black/15'
          : 'border-transparent bg-transparent font-medium text-white/50',
      )}
      onClick={onClick}
    >
      <span className="inline-block">{label}</span>
      <span
        className={cn(
          'inline-flex min-w-[22px] items-center justify-center rounded-full px-[7px] py-[2px] text-[10.5px] leading-[1.4] font-semibold tracking-[0.01em]',
          active ? 'bg-white/13 text-white/85' : 'bg-white/6 text-white/65',
        )}
      >{count}</span>
    </button>
  )
}
