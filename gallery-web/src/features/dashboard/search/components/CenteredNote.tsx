import type { ReactNode } from 'react'

export function CenteredNote({ title, body, action }: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-[4px] border border-line bg-surface px-6 py-14 text-center">
      <div className="mb-2 text-[17px] font-medium text-ink">
        {title}
      </div>
      {body && (
        <p className="mx-auto max-w-[420px] text-[13px] leading-[1.6] text-muted">
          {body}
        </p>
      )}
      {action && <div className="mt-[18px]">{action}</div>}
    </div>
  )
}
