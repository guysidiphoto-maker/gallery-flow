import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { windowBar, windowFrame } from './classes'
import { WindowDots } from './WindowDots'

export function BrowserMockup({ url, className, children }: { url: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn(windowFrame, 'mx-auto max-w-[900px]', className)}>
      <div className={cn(windowBar, 'items-center')}>
        <WindowDots />
        <span className="mr-3 max-w-[320px] flex-1 truncate rounded-sm bg-white/5 px-3 py-1 text-[0.75rem] text-white/50">{url}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}
