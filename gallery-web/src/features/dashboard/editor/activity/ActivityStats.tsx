import { Icon, type IconName } from '@/shared/ui/Icon'
import type { ActivitySummary } from '../../types'

export function ActivityStats({ summary }: { summary: ActivitySummary }) {
  return (
    <div className="mb-9 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border border-line bg-surface">
      {([
        { label: 'Downloads', value: summary.downloads_total, icon: 'download' as IconName },
        { label: 'Favorites', value: summary.favorites_total, icon: 'heart'    as IconName },
        { label: 'Emails',    value: summary.emails_total,    icon: 'mail'     as IconName },
      ]).map((s, i) => (
        <div key={s.label} className={i > 0 ? 'border-s border-line p-6' : 'p-6'}>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-medium tracking-label text-muted uppercase">
            <Icon name={s.icon} size={12} strokeWidth={1.6} />
            <span>{s.label}</span>
          </div>
          <div className="text-[28px] leading-none font-normal tracking-[-0.025em] text-ink tabular-nums lining-nums">
            {s.value.toLocaleString('he-IL')}
          </div>
        </div>
      ))}
    </div>
  )
}
