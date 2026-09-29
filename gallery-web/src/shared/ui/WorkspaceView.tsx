import type { ReactNode } from 'react'
import { cn } from './cn'
import { Eyebrow } from './Field'

/**
 * One dashboard tab: shared header (eyebrow, h1, description, actions on the
 * same row) and entrance animation, so every tab's title lands at the same spot.
 * Width and outer padding come from the dashboard shell, never from the tab.
 */
export function WorkspaceView({ eyebrow, title, description, actions, dir, className, children }: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  dir?: 'rtl' | 'ltr'
  className?: string
  children: ReactNode
}) {
  // `backwards` fill: once the entrance ends no transform lingers, so fixed
  // overlays (modals, toasts) inside the tab still position against the viewport.
  return (
    <section dir={dir} className={cn('animate-[dash-fade-up_.4s_ease_backwards] text-ink', className)}>
      <header className="mb-9 flex flex-wrap items-end justify-between gap-x-5 gap-y-4">
        <div className="min-w-0">
          {/* Fixed-height eyebrow row so a badge next to it can't nudge the title. */}
          <Eyebrow className="mb-3.5 flex h-5 items-center gap-2.5 font-medium">{eyebrow}</Eyebrow>
          <h1 className="text-[clamp(28px,4vw,52px)] leading-[1.02] font-medium tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-3.5 max-w-[560px] text-[15px] leading-[1.55] text-ink-soft">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/** Header-row action sizing shared by every tab, so buttons match in height. */
export const workspaceAction = 'h-10 gap-2 px-5 py-0 text-xs tracking-[0.12em] whitespace-nowrap'
