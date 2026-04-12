import React, { useEffect, useRef } from 'react'

interface KeyboardShortcutsProps {
  onClose: () => void
}

interface ShortcutEntry {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutEntry[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['ArrowLeft', 'ArrowRight'], description: 'Move between images' },
      { keys: ['ArrowUp', 'ArrowDown'], description: 'Move between rows' },
      { keys: ['Home'], description: 'Move selected to top' },
      { keys: ['End'], description: 'Move selected to bottom' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['\u2318', 'A'], description: 'Select / deselect all' },
      { keys: ['Escape'], description: 'Deselect all' },
      { keys: ['Click'], description: 'Select image' },
      { keys: ['Shift', 'Click'], description: 'Select range' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['T'], description: 'Top Pick selected images' },
      { keys: ['Shift', 'T'], description: 'Remove Top Pick' },
      { keys: ['Delete'], description: 'Delete selected images' },
      { keys: ['\u2318', 'Z'], description: 'Undo' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['\u2318', 'P'], description: 'Toggle preview mode' },
      { keys: ['\u2318', 'O'], description: 'Open folder' },
    ],
  },
  {
    title: 'Publishing',
    shortcuts: [
      { keys: ['\u2318', 'Enter'], description: 'Apply order (rename files)' },
      { keys: ['\u2318', 'S'], description: 'Open Story modal' },
    ],
  },
]

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 8px',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 5,
  fontSize: 11.5,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
  color: 'rgba(255,255,255,.75)',
  lineHeight: '18px',
  minWidth: 22,
  textAlign: 'center',
}

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'ks-fade .15s ease both',
      }}
    >
      <style>{`
        @keyframes ks-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ks-slide { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div
        ref={cardRef}
        style={{
          background: '#0f0f17',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 16,
          padding: '28px 32px 24px',
          width: 480,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,.6)',
          position: 'relative',
          animation: 'ks-slide .2s ease both',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            padding: 0,
            fontFamily: 'inherit',
            transition: 'background .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Title */}
        <h2 style={{
          fontSize: 17,
          fontWeight: 700,
          color: 'rgba(255,255,255,.92)',
          margin: '0 0 20px',
          letterSpacing: '-0.01em',
        }}>
          Keyboard Shortcuts
        </h2>

        {/* Groups */}
        {shortcutGroups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: gi < shortcutGroups.length - 1 ? 20 : 0 }}>
            <div style={{
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#6366f1',
              marginBottom: 8,
            }}>
              {group.title}
            </div>
            {group.shortcuts.map((shortcut, si) => (
              <div key={si} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: si < group.shortcuts.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
              }}>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.65)' }}>
                  {shortcut.description}
                </span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {shortcut.keys.map((key, ki) => (
                    <kbd key={ki} style={kbdStyle}>{key}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}

        {/* Footer hint */}
        <div style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,.06)',
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(255,255,255,.3)',
        }}>
          Press <kbd style={{ ...kbdStyle, fontSize: 10.5 }}>?</kbd> to toggle this panel
        </div>
      </div>
    </div>
  )
}
