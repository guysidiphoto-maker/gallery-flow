// Minimal in-app notification: `const { showToast, ToastContainer } = useToast()`.
// Max 3 visible, auto-dismiss after 4s, click to dismiss.

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from './cn'
import './toast.css'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastInput {
  kind: ToastKind
  text: string
}

interface ToastItem extends ToastInput {
  id: number
}

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 4000

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const showToast = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setToasts(prev => {
      const next = [...prev, { ...input, id }]
      while (next.length > MAX_VISIBLE) {
        const dropped = next.shift()
        if (dropped) {
          const t = timers.current.get(dropped.id)
          if (t) { clearTimeout(t); timers.current.delete(dropped.id) }
        }
      }
      return next
    })
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    timers.current.set(id, timer)
  }, [dismiss])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach(t => clearTimeout(t))
      map.clear()
    }
  }, [])

  const ToastContainer = useCallback(() => (
    // Pinned bottom-left: the visual "bottom-end" of the RTL UI.
    <div
      dir="rtl"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-5 left-5 z-[200] flex flex-col gap-2 font-[Heebo,Inter,sans-serif]"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          onClick={() => dismiss(t.id)}
          className={cn(
            KIND_CLASS[t.kind],
            'pointer-events-auto inline-flex max-w-[380px] cursor-pointer items-center gap-2.5 rounded-[8px] border',
            'border-(--toast-accent) bg-night px-3.5 py-2.5 text-[13px] leading-[1.4] text-white/92',
            'shadow-card shadow-black/50 animate-[toast-in_0.25s_var(--ease-out-expo)_both]',
          )}
        >
          <span className="size-2 shrink-0 rounded-full bg-(--toast-accent)" />
          <span className="flex-1 whitespace-pre-wrap">{t.text}</span>
        </div>
      ))}
    </div>
  ), [toasts, dismiss])

  return { showToast, ToastContainer }
}
