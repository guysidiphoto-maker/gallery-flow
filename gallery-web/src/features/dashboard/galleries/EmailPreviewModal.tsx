import { bg, border, textMuted } from '../styles'

// Server-composed email in a sandboxed iframe (styles only, no scripts) so
// links can't navigate the dashboard tab.
export function EmailPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2200,
        background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'overlayIn .2s ease both',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="תצוגה מקדימה של המייל"
        onClick={e => e.stopPropagation()}
        style={{
          background: bg, width: '100%', maxWidth: 640,
          borderRadius: 22, padding: 20,
          border: `1px solid ${border}`,
          animation: 'modalIn .3s ease both',
          boxShadow: '0 30px 100px rgba(0,0,0,.6)',
          display: 'flex', flexDirection: 'column', gap: 12,
          maxHeight: '90vh',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>תצוגה מקדימה</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            style={{
              background: 'transparent', border: 'none', color: textMuted,
              fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4,
            }}
          >×</button>
        </div>
        <iframe
          title="email-preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{
            width: '100%', flex: 1, minHeight: 480,
            border: `1px solid ${border}`, borderRadius: 12, background: '#fff',
          }}
        />
      </div>
    </div>
  )
}
