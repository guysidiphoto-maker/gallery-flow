import React, { useState } from 'react'
import { Icon, type IconName } from '../Icon'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { c } from './theme'

// ── Date/relative-time helpers ───────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'מעולם לא'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const day = 86_400_000
  if (diff < 0) return formatDate(iso)
  if (diff < 60_000) return 'הרגע'
  if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`
  if (diff < day) return `לפני ${Math.floor(diff / 3_600_000)} שע׳`
  if (diff < 7 * day) return `לפני ${Math.floor(diff / day)} ימים`
  return formatDate(iso)
}

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'live' | 'warn' | 'danger' | 'accent'

const BADGE_TONE: Record<BadgeTone, { color: string; border: string; bg: string }> = {
  neutral: { color: c.textMuted, border: c.border, bg: 'transparent' },
  live: { color: c.statusLive, border: 'rgba(123,143,110,.5)', bg: 'rgba(123,143,110,.08)' },
  warn: { color: '#8A6D3B', border: 'rgba(138,109,59,.5)', bg: 'rgba(138,109,59,.07)' },
  danger: { color: c.danger, border: 'rgba(180,82,74,.5)', bg: 'rgba(180,82,74,.06)' },
  accent: { color: c.textPrimary, border: c.textPrimary, bg: 'transparent' },
}

export function Badge({
  children, tone = 'neutral', icon,
}: { children: React.ReactNode; tone?: BadgeTone; icon?: IconName }) {
  const t = BADGE_TONE[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
      padding: '3px 8px', borderRadius: 0, textTransform: 'uppercase',
      color: t.color, border: `1px solid ${t.border}`, background: t.bg,
      whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={11} strokeWidth={1.7} />}
      {children}
    </span>
  )
}

// ── Buttons ─────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger'

export function Button({
  children, onClick, type = 'button', variant = 'outline',
  disabled = false, busy = false, icon, style, title, autoFocus,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: BtnVariant
  disabled?: boolean
  busy?: boolean
  icon?: IconName
  style?: React.CSSProperties
  title?: string
  autoFocus?: boolean
}) {
  const isDisabled = disabled || busy
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    padding: '11px 20px', borderRadius: 2, cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'background .18s, color .18s, border-color .18s, opacity .18s',
    opacity: isDisabled ? 0.5 : 1, whiteSpace: 'nowrap',
  }
  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: c.textPrimary, color: '#fff', border: `1px solid ${c.textPrimary}` },
    outline: { background: 'transparent', color: c.textPrimary, border: `1px solid ${c.textPrimary}` },
    ghost: { background: 'transparent', color: c.textSecondary, border: `1px solid ${c.border}` },
    danger: { background: 'transparent', color: c.danger, border: `1px solid ${c.danger}` },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      autoFocus={autoFocus}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={e => {
        if (isDisabled) return
        if (variant === 'outline') { e.currentTarget.style.background = c.textPrimary; e.currentTarget.style.color = '#fff' }
        if (variant === 'ghost') e.currentTarget.style.borderColor = c.textPrimary
        if (variant === 'danger') { e.currentTarget.style.background = c.danger; e.currentTarget.style.color = '#fff' }
      }}
      onMouseLeave={e => {
        if (variant === 'outline') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = c.textPrimary }
        if (variant === 'ghost') e.currentTarget.style.borderColor = c.border
        if (variant === 'danger') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = c.danger }
      }}
    >
      {busy ? 'רגע…' : (<>{icon && <Icon name={icon} size={13} strokeWidth={1.8} />}{children}</>)}
    </button>
  )
}

// ── Modal (focus-trapped, Esc-closes, click-backdrop-closes) ─────────────────

export function Modal({
  open, onClose, title, children, maxWidth = 560,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: number
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose)
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '48px 16px', overflowY: 'auto', animation: 'overlayIn .2s ease both',
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          background: c.bg, width: '100%', maxWidth, borderRadius: 4,
          border: `1px solid ${c.border}`, animation: 'modalIn .3s ease both',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: `1px solid ${c.border}`,
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', color: c.textPrimary }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 4, background: 'transparent',
              border: `1px solid ${c.border}`, color: c.textMuted, cursor: 'pointer', padding: 0,
            }}
          >
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── CopyField — shows a link/token and copies it with visible confirmation ────

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      {label && (
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: c.textMuted, marginBottom: 8,
        }}>{label}</div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          readOnly
          value={value}
          onFocus={e => e.currentTarget.select()}
          style={{
            flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12,
            padding: '10px 12px', borderRadius: 2, border: `1px solid ${c.border}`,
            background: c.cardSolid, color: c.textSecondary, direction: 'ltr', textAlign: 'left',
          }}
        />
        <button
          onClick={copy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '0 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
            border: `1px solid ${copied ? c.statusLive : c.textPrimary}`,
            background: copied ? 'rgba(123,143,110,.1)' : 'transparent',
            color: copied ? c.statusLive : c.textPrimary,
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} strokeWidth={1.9} />
          {copied ? 'הועתק' : 'העתק'}
        </button>
      </div>
    </div>
  )
}

// ── Field wrapper for labeled inputs ─────────────────────────────────────────

export function Field({
  label, required, children, hint,
}: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 18 }}>
      <span style={{
        display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: c.textMuted, marginBottom: 8,
      }}>
        {label}{required && <span style={{ color: c.danger }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 12, color: c.textMuted, marginTop: 6 }}>{hint}</span>}
    </label>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14,
  padding: '11px 13px', borderRadius: 2, border: `1px solid ${c.border}`,
  background: c.cardSolid, color: c.textPrimary,
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({
  icon = 'clients', title, body, action,
}: { icon?: IconName; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${c.border}`, background: c.bgSubtle, borderRadius: 4,
      padding: '56px 32px', textAlign: 'center', display: 'flex',
      flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: c.textMuted,
        border: `1px solid ${c.border}`, marginBottom: 8,
      }}>
        <Icon name={icon} size={20} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{title}</div>
      {body && <div style={{ fontSize: 13.5, color: c.textMuted, maxWidth: 360, lineHeight: 1.5 }}>{body}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

// ── Inline error banner ───────────────────────────────────────────────────────

export function ErrorBanner({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      border: `1px solid rgba(180,82,74,.4)`, background: 'rgba(180,82,74,.05)',
      color: c.danger, borderRadius: 4, padding: '14px 18px', fontSize: 13.5,
    }}>
      <span>{text}</span>
      {onRetry && <Button variant="danger" onClick={onRetry} style={{ padding: '7px 14px' }}>נסה שוב</Button>}
    </div>
  )
}

// ── Skeleton block ────────────────────────────────────────────────────────────

export function Skeleton({ height = 64, count = 4 }: { height?: number; count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height, borderRadius: 4, border: `1px solid ${c.border}`,
          background: `linear-gradient(90deg, ${c.bgSubtle} 25%, ${c.border} 50%, ${c.bgSubtle} 75%)`,
          backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
        }} />
      ))}
    </div>
  )
}
