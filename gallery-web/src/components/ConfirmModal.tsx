// ConfirmModal — Editorial-minimal destructive/neutral confirm dialog.
//
// Replaces native `window.confirm()` calls in the dashboard. Native confirm
// renders LTR on macOS/Windows regardless of `dir`, breaks the open modal's
// focus trap, and clashes with the cream/hairline aesthetic. This component:
//
//   • Lives in the React tree, so it inherits RTL + can be styled.
//   • Reuses `useFocusTrap` so keyboard nav stays inside the dialog and
//     focus is restored to the trigger element on close (WCAG 2.1.2 / 2.4.3).
//   • Escape + backdrop click both cancel — matches the dashboard's other
//     modal vocabulary (AddSet, NewGallery, BuyTokens).
//   • `danger` swaps the confirm CTA to a destructive red outline that
//     fills on hover, while keeping the same shape as the standard CTA.
//
// Usage is almost always via `useConfirm()` (Promise-based API), but the
// component is exported standalone for callers that need to control the
// open state directly (e.g. wizard-style confirmations).

import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'

// Color tokens duplicated locally to keep ConfirmModal self-contained.
// Mirrors the editorial-minimal palette at the top of Dashboard.tsx; if
// those tokens move into a shared module, this block becomes a single
// re-export.
const bg          = '#F2EFE9'
const cardSolid   = '#FFFFFF'
const border      = '#D0D0D0'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted   = '#767470'
const dangerColor = '#c0392b'

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
  // useFocusTrap returns a ref that, when attached to the dialog div, traps
  // Tab/Shift+Tab inside and dispatches Escape to onCancel. The hook is a
  // no-op when `open` is false, so we still always call it (Rules of Hooks).
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onCancel)

  // Lock body scroll while the modal is open. Matches what the editor /
  // share / buy-tokens modals do implicitly via overflow: hidden on the
  // backdrop layer — but those use fixed inset:0 backdrops that already
  // cover the page. Doing it here makes ConfirmModal portable to any
  // future surface that doesn't.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  // Backdrop click cancels. We stopPropagation on the dialog wrapper so
  // clicks inside the dialog don't bubble up and dismiss it.
  return (
    <div
      onClick={onCancel}
      style={backdropStyle}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={body ? 'confirm-modal-body' : undefined}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <h3 id="confirm-modal-title" style={titleStyle}>{title}</h3>

        {body && (
          <div id="confirm-modal-body" style={bodyStyle}>
            {body}
          </div>
        )}

        <div style={actionsStyle}>
          <button
            type="button"
            onClick={onCancel}
            style={cancelBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = textPrimary }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = border }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            style={danger ? dangerBtnStyle : confirmBtnStyle}
            onMouseEnter={(e) => {
              if (danger) {
                e.currentTarget.style.background = dangerColor
                e.currentTarget.style.color = '#fff'
              } else {
                e.currentTarget.style.background = textPrimary
                e.currentTarget.style.color = '#fff'
              }
            }}
            onMouseLeave={(e) => {
              if (danger) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = dangerColor
              } else {
                e.currentTarget.style.background = textPrimary
                e.currentTarget.style.color = '#fff'
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────
// Sits above every dashboard modal (zIndex 1200 vs the editor / buy-tokens
// at 1100) so a confirm spawned from inside another modal stacks correctly.
const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  background: 'rgba(20,20,19,.55)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'overlayIn .2s ease both',
  direction: 'rtl',
  fontFamily: 'Heebo, Inter, sans-serif',
}

const dialogStyle: CSSProperties = {
  background: cardSolid,
  width: 'calc(100vw - 40px)',
  maxWidth: 440,
  padding: '36px 36px 28px',
  border: `1px solid ${border}`,
  animation: 'modalIn .25s ease both',
  color: textPrimary,
}

const titleStyle: CSSProperties = {
  margin: 0,
  marginBottom: 14,
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.35,
  color: textPrimary,
}

const bodyStyle: CSSProperties = {
  marginBottom: 28,
  fontSize: 14,
  lineHeight: 1.55,
  color: textSecondary,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-start',
  marginTop: 8,
}

// Base CTA shape shared by all three button variants — same height + tracked
// uppercase label as the dashboard's "Save" / "Cancel" buttons.
const baseBtnStyle: CSSProperties = {
  padding: '10px 22px',
  borderRadius: 2,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  transition: 'background .15s, color .15s, border-color .15s',
}

const cancelBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  background: 'transparent',
  border: `1px solid ${border}`,
  color: textPrimary,
}

const confirmBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  background: textPrimary,
  border: `1px solid ${textPrimary}`,
  color: '#fff',
}

const dangerBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  background: 'transparent',
  border: `1px solid ${dangerColor}`,
  color: dangerColor,
}

// Mark intentionally exported tokens so the file doesn't trip "unused"
// warnings if a future variant needs the cream canvas color.
void bg
void textMuted
