// ui.tsx — tiny presentational primitives shared by the Import Center steps.
// Deliberately dependency-light (inline styles) so this wizard drops into the
// Dashboard without pulling a component library. RTL is driven by the `dir`
// passed down from ImportCenter (from the `locale` prop / useOwnerLocale).

import React from 'react'

export const palette = {
  bg: '#0f1115',
  panel: '#171a21',
  panelAlt: '#1e222b',
  border: '#2a2f3a',
  text: '#e7e9ee',
  textDim: '#9aa1ad',
  accent: '#5b8cff',
  accentText: '#ffffff',
  ok: '#2fbf71',
  warn: '#e0a63c',
  danger: '#e05a5a',
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: palette.panel, border: `1px solid ${palette.border}`,
      borderRadius: 12, padding: 20, ...style,
    }}>{children}</div>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button', title,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const base: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, padding: '10px 18px', borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: '1px solid transparent', transition: 'opacity .15s',
  }
  const styles: Record<string, React.CSSProperties> = {
    primary: { ...base, background: palette.accent, color: palette.accentText },
    ghost: { ...base, background: 'transparent', color: palette.text, borderColor: palette.border },
    danger: { ...base, background: 'transparent', color: palette.danger, borderColor: palette.danger },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={styles[variant]}>
      {children}
    </button>
  )
}

export function Chip({ kind, children }: { kind: 'ok' | 'warn' | 'danger' | 'neutral'; children: React.ReactNode }) {
  const map: Record<string, { bg: string; fg: string }> = {
    ok: { bg: 'rgba(47,191,113,.15)', fg: palette.ok },
    warn: { bg: 'rgba(224,166,60,.15)', fg: palette.warn },
    danger: { bg: 'rgba(224,90,90,.15)', fg: palette.danger },
    neutral: { bg: 'rgba(154,161,173,.15)', fg: palette.textDim },
  }
  const c = map[kind]
  return (
    <span style={{
      display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '3px 10px',
      borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const color = tone === 'warn' ? palette.warn : tone === 'danger' ? palette.danger : tone === 'ok' ? palette.ok : palette.accent
  return (
    <div style={{
      borderInlineStart: `3px solid ${color}`, background: palette.panelAlt,
      padding: '10px 14px', borderRadius: 8, fontSize: 13, color: palette.text, lineHeight: 1.6,
    }}>{children}</div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: palette.textDim, fontSize: 14 }}>
      <span style={{
        width: 16, height: 16, border: `2px solid ${palette.border}`, borderTopColor: palette.accent,
        borderRadius: '50%', display: 'inline-block', animation: 'ic-spin 0.8s linear infinite',
      }} />
      {label}
      <style>{'@keyframes ic-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div style={{ background: palette.panelAlt, borderRadius: 999, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: palette.accent, transition: 'width .2s' }} />
    </div>
  )
}
