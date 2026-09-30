import { cn } from '@/shared/ui'

export function StatCard({
  value, label, hint, tone, onClick,
}: {
  value: string
  label: string
  hint?: string
  tone?: 'warn'
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 rounded-[8px] border border-line-soft bg-raised px-[22px] py-5 text-start transition-colors duration-150',
        onClick ? 'cursor-pointer hover:border-ink' : 'cursor-default',
      )}
    >
      <span className={cn('text-[30px] leading-none font-medium tracking-[-0.02em]', tone === 'warn' ? 'text-warning' : 'text-ink')}>
        {value}
      </span>
      <span className="text-[13px] text-ink-soft">{label}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </button>
  )
}
