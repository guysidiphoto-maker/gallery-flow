import React from 'react'
import { useGallery } from '../store/gallery'

export function ToastStack() {
  const { toasts, dismissToast, undoRename } = useGallery()

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast__message">{toast.message}</span>
          <div className="toast__actions">
            {toast.undoId && (
              <button
                className="toast__undo"
                onClick={() => {
                  dismissToast(toast.id)
                  undoRename(toast.undoId!)
                }}
              >
                Undo
              </button>
            )}
            <button
              className="toast__dismiss"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
