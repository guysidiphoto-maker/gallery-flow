// In-tree replacement for window.confirm(): native confirm ignores RTL and breaks
// an open modal's focus trap. Usually driven through useConfirm().

import type { ReactNode } from 'react'
import { Button } from './Button'
import { cn } from './cn'
import { Modal } from './Modal'

export interface ConfirmModalProps {
  open: boolean
  title: string
  body?: string | ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** When true, the confirm CTA renders in a destructive red variant. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const BTN = 'px-[22px]'

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'ביטול',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      dir="rtl"
      role="alertdialog"
      labelledBy="confirm-modal-title"
      describedBy={body ? 'confirm-modal-body' : undefined}
      // Above the dashboard's own modals (z 1100) so a confirm spawned inside one stacks on top.
      overlayClassName="z-[1200] animate-none bg-ink/55 p-5 font-[Heebo,Inter,sans-serif] backdrop-blur-[6px]"
      className="max-w-[440px] px-9 pt-9 pb-7 shadow-none"
    >
      {/* Portalled, so stop clicks bubbling to React ancestors as the inline version did. */}
      <div onClick={e => e.stopPropagation()}>
        <h3 id="confirm-modal-title" className="mb-3.5 text-lg leading-[1.35] font-semibold text-ink">{title}</h3>

        {body && (
          <div id="confirm-modal-body" className="mb-7 text-sm leading-[1.55] text-ink-soft">
            {body}
          </div>
        )}

        <div className="mt-2 flex justify-start gap-2.5">
          <Button variant="ghost" className={BTN} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className={cn(BTN, !danger && 'hover:bg-ink')} autoFocus onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
