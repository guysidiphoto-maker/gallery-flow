import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { cn } from './cn'

/** Centered dialog with scrim, focus trap, Escape-to-close and scroll lock. */
export function Modal({ open, onClose, title, children, className, overlayClassName, dir, role = 'dialog', labelledBy, describedBy }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  overlayClassName?: string
  dir?: 'rtl' | 'ltr'
  role?: 'dialog' | 'alertdialog'
  labelledBy?: string
  describedBy?: string
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className={cn('fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-scrim p-4 backdrop-blur-sm', overlayClassName)}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        dir={dir}
        className={cn('max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-raised p-8 text-ink shadow-pop', className)}
      >
        {title && <h2 className="mb-5 text-xl font-medium tracking-tight">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
