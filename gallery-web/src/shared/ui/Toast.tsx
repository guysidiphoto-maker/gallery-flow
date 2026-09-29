// Toast — minimal in-app notification for visible failure/success surfaces.
//
// Usage:
//   const { showToast, ToastContainer } = useToast()
//   <ToastContainer />
//   showToast({ kind: 'error', text: 'שמירה נכשלה. נסה שוב.' })
//
// Design language: matches FeedStudio dark theme + RTL. No external deps.
// Stack pinned to bottom-left (RTL "bottom-end"), max 3 visible, auto-dismiss
// after 4 seconds.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

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

const KIND_COLOR: Record<ToastKind, string> = {
  success: '#3DDC84',
  error:   '#ff6b6b',
  info:    '#D4FF00',
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
      // Drop oldest if exceeding cap.
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

  // Cleanup all timers on unmount.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach(t => clearTimeout(t))
      map.clear()
    }
  }, [])

  const ToastContainer = useCallback(() => (
    <div style={containerStyle} aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          onClick={() => dismiss(t.id)}
          style={{ ...itemStyle, borderColor: KIND_COLOR[t.kind] }}
        >
          <span style={{ ...dotStyle, background: KIND_COLOR[t.kind] }} />
          <span style={textStyle}>{t.text}</span>
        </div>
      ))}
    </div>
  ), [toasts, dismiss])

  return { showToast, ToastContainer }
}

// ── Styles ──────────────────────────────────────────────────────────────
const containerStyle: CSSProperties = {
  position: 'fixed',
  bottom: 20,
  // RTL: visual "bottom-end" sits at bottom-left of the viewport.
  left: 20,
  right: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 200,
  pointerEvents: 'none',
  direction: 'rtl',
  fontFamily: 'Heebo, Inter, sans-serif',
}

const itemStyle: CSSProperties = {
  pointerEvents: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  background: '#0a0a0f',
  color: 'rgba(255,255,255,.92)',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  lineHeight: 1.4,
  boxShadow: '0 8px 24px rgba(0,0,0,.5)',
  maxWidth: 380,
  cursor: 'pointer',
  animation: 'toast-in .25s cubic-bezier(.16,1,.3,1) both',
}

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 4,
  flexShrink: 0,
}

const textStyle: CSSProperties = {
  flex: 1,
  whiteSpace: 'pre-wrap',
}

// Inject the keyframe once at module load (idempotent).
if (typeof document !== 'undefined' && !document.getElementById('toast-keyframes')) {
  const style = document.createElement('style')
  style.id = 'toast-keyframes'
  style.textContent = `@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`
  document.head.appendChild(style)
}
