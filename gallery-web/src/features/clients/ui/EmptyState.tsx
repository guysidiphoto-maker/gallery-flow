import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon'

export function EmptyState({ icon = 'clients', title, body, action }: {
  icon?: IconName
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[4px] border border-line bg-surface px-8 py-14 text-center">
      <div className="mb-2 flex size-12 items-center justify-center rounded-full border border-line text-muted">
        <Icon name={icon} size={20} strokeWidth={1.5} />
      </div>
      <div className="text-[17px] font-medium text-ink">{title}</div>
      {body && <div className="max-w-[360px] text-[13.5px] leading-normal text-muted">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
