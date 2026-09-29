import React, { useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/shared/lib/useDismiss'
import { Icon } from '@/shared/ui/Icon'
import { border, cardSolid, textPrimary } from '../styles'
import { useEditor, useOpenGallery } from './EditorContext'

// Gallery-level actions in one accessible dropdown (role=menu, arrow keys,
// outside-click / Escape dismiss). Delete is visually separated.
export function GalleryMoreMenu() {
  const { session, exporter, actions } = useEditor()
  const gallery = useOpenGallery()
  const [open, setOpen] = useState(false)
  const menuRef = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Focus the first item on open; on keyboard dismissal return focus to the trigger.
  useEffect(() => {
    if (open) {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')
      first?.focus({ preventScroll: true })
    } else if (document.activeElement && menuRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  const items = [
    { icon: 'link' as const, label: 'העתק קישור ישיר', danger: false, onClick: () => session.copyDirectLink(actions.shareUrl(gallery), gallery.id) },
    { icon: 'share' as const, label: 'שיתוף ומרכז שיתוף', danger: false, onClick: () => actions.openEmailShare(gallery) },
    { icon: 'download' as const, label: 'ייצוא הגלריה (ZIP)', danger: false, onClick: () => { void exporter.handleGalleryExport() } },
    { icon: 'duplicate' as const, label: 'שכפל גלריה', danger: false, onClick: () => { void actions.duplicateGallery(gallery) } },
    { icon: 'trash' as const, label: 'מחק גלריה', danger: true, onClick: () => { void actions.deleteGallery(gallery) } },
  ]

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="עוד פעולות לגלריה"
        style={{
          padding: '10px 16px', borderRadius: 2, fontSize: 11, fontWeight: 500,
          background: open ? 'rgba(0,0,0,.04)' : 'transparent',
          border: `1px solid ${border}`, color: textPrimary, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '0.18em', textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        More
        <Icon name="menu" size={13} strokeWidth={1.85} />
      </button>
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-label="פעולות גלריה"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? [])
            if (!buttons.length) return
            const cur = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next = e.key === 'ArrowDown' ? (cur + 1) % buttons.length : (cur - 1 + buttons.length) % buttons.length
            buttons[next]?.focus({ preventScroll: true })
          }}
          style={{
            position: 'absolute', top: 40, insetInlineEnd: 0, zIndex: 20,
            minWidth: 220, padding: 4, direction: 'rtl',
            background: cardSolid, border: `1px solid ${border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          }}
        >
          {items.map(item => (
            <React.Fragment key={item.label}>
              {item.danger && <div style={{ height: 1, background: border, margin: '4px 0' }} />}
              <button
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick() }}
                style={{
                  width: '100%', textAlign: 'right', padding: '9px 10px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12,
                  color: item.danger ? '#dc2626' : textPrimary,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>{item.label}</span>
                <Icon name={item.icon} size={13} strokeWidth={1.85} />
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
