import { cn } from '@/shared/ui'
import { surfaceAlt } from './theme'

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className={cn(surfaceAlt, 'h-2 overflow-hidden rounded-full')}>
      <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  )
}
