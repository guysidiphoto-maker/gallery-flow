import React, { useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/shared/lib/useDismiss'
import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
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
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="עוד פעולות לגלריה"
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-hair border border-line px-4 py-2.5 text-[11px] font-medium tracking-label text-ink uppercase',
          open ? 'bg-black/4' : 'bg-transparent',
        )}
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
          className="absolute end-0 top-10 z-20 min-w-[220px] border border-line bg-raised p-1 shadow-card [direction:rtl]"
        >
          {items.map(item => (
            <React.Fragment key={item.label}>
              {item.danger && <div className="my-1 h-px bg-line" />}
              <button
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick() }}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between bg-transparent px-2.5 py-[9px] text-right text-[12px]',
                  item.danger ? 'text-danger-strong' : 'text-ink',
                )}
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
