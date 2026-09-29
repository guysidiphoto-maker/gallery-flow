// Promise-based confirm: `if (!(await confirm({ title, confirmLabel }))) return`,
// with `<ConfirmHost />` rendered once. A second confirm() cancels the first.

import { createElement, useCallback, useRef, useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function useConfirm() {
  // State drives rendering; the ref lets close() resolve synchronously despite batching.
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const pendingRef = useRef<PendingConfirm | null>(null)

  const close = useCallback((result: boolean) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    setPending(null)
    current.resolve(result)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // Resolve a still-open confirm as cancelled so its promise never leaks.
      if (pendingRef.current) {
        const prev = pendingRef.current
        pendingRef.current = null
        prev.resolve(false)
      }
      const next: PendingConfirm = { ...opts, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  // Stable identity so React doesn't remount the modal on every parent render.
  const ConfirmHost = useCallback(() => {
    return createElement(ConfirmModal, {
      open: pending !== null,
      title: pending?.title ?? '',
      body: pending?.body,
      confirmLabel: pending?.confirmLabel ?? '',
      cancelLabel: pending?.cancelLabel,
      danger: pending?.danger,
      onConfirm: () => close(true),
      onCancel: () => close(false),
    })
  }, [pending, close])

  return { confirm, ConfirmHost }
}
