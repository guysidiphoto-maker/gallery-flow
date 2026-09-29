// useConfirm — Promise-based wrapper around <ConfirmModal />.
//
// Lets a caller swap a native `if (!confirm('…')) return` line for an
// equally linear `if (!(await confirm({…}))) return`, without manually
// wiring open-state, onConfirm, and onCancel handlers at each call site.
//
// Usage:
//   const { confirm, ConfirmHost } = useConfirm()
//   …
//   if (!(await confirm({
//     title: 'למחוק את הגלריה?',
//     body: 'פעולה זו לא ניתנת לביטול.',
//     confirmLabel: 'מחק',
//     danger: true,
//   }))) return
//   …
//   return <>{/* dashboard tree */}<ConfirmHost /></>
//
// Only one pending confirm is supported at a time. If a second confirm() is
// invoked while the first is still open, the first resolves to false and is
// replaced — same behavior native `confirm()` cannot offer.

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
  // The currently-open confirm (if any). State is the source of truth for
  // rendering; the ref mirrors it so async resolve() inside the close
  // handler can fire even after React batches the setState.
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
      // If a confirm is already open, resolve it as cancelled before
      // opening the next one. This matches what would happen if a user
      // clicked the backdrop on the first dialog, and avoids leaking
      // unresolved promises.
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

  // ConfirmHost is intentionally a function (not a memoized component) so
  // the consumer can render it inline: `<ConfirmHost />`. Wrapped in
  // useCallback so its identity is stable across renders and React's
  // reconciler doesn't tear down the modal on every parent render.
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
