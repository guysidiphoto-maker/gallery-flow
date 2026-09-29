import React, { useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/shared/lib/useDismiss'
import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { useEditor, useOpenGallery } from './EditorContext'
import { headerAction } from './headerAction'

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
    { icon: 'link' as const, label: 'העתקת קישור ישיר', danger: false, onClick: () => session.copyDirectLink(actions.shareUrl(gallery), gallery.id) },
    { icon: 'share' as const, label: 'שיתוף ומרכז שיתוף', danger: false, onClick: () => actions.openEmailShare(gallery) },
    { icon: 'download' as const, label: 'ייצוא הגלריה (ZIP)', danger: false, onClick: () => { void exporter.handleGalleryExport() } },
    { icon: 'duplicate' as const, label: 'שכפול גלריה', danger: false, onClick: () => { void actions.duplicateGallery(gallery) } },
    { icon: 'trash' as const, label: 'מחיקת גלריה', danger: true, onClick: () => { void actions.deleteGallery(gallery) } },
  ]

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="עוד פעולות לגלריה"
        className={cn(
          headerAction,
          'cursor-pointer border-line text-ink hover:border-ink',
          open ? 'bg-black/4' : 'bg-transparent',
        )}
      >
        <Icon name="more-vertical" size={14} strokeWidth={1.85} />
        עוד

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
          className="absolute end-0 top-10 z-20 min-w-[220px] border border-line bg-raised p-1 shadow-card [direction:rtl]"
        >
          {items.map(item => (
            <React.Fragment key={item.label}>
              {item.danger && <div className="my-1 h-px bg-line" />}
              <button
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick() }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 bg-transparent px-2.5 py-[9px] text-start text-[12px] hover:bg-sunken',
                  item.danger ? 'text-danger-strong' : 'text-ink',
                )}
              >
                <Icon name={item.icon} size={14} strokeWidth={1.85} />
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
