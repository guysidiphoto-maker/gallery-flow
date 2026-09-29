import type { ReactNode } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'

// Local (not the shared portaled Modal): it must stay in-tree at z-1200 so the
// shared ConfirmModal, also z-1200 but mounted later, stacks above it.
export function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose)
  if (!open) return null
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1200] flex animate-fade-in items-start justify-center overflow-y-auto bg-ink/55 px-4 py-12 backdrop-blur-[6px]"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="flex w-full max-w-[560px] flex-col rounded-[4px] border border-line bg-canvas"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="flex size-8 items-center justify-center rounded-[4px] border border-line bg-transparent p-0 text-muted"
          >
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
