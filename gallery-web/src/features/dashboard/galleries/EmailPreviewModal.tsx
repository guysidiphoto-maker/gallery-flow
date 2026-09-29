// Server-composed email in a sandboxed iframe (styles only, no scripts) so
// links can't navigate the dashboard tab.
export function EmailPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div onClick={onClose} className="z-[2200] fixed inset-0 flex animate-[dash-overlay-in_.2s_ease_both] items-center justify-center bg-black/78 p-5 backdrop-blur-[10px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="תצוגה מקדימה של המייל"
        onClick={e => e.stopPropagation()}
        className="flex max-h-[90vh] max-w-[640px] flex-col gap-3 p-5 w-full animate-[dash-modal-in_.3s_ease_both] rounded-[22px] border border-line bg-canvas shadow-[0_30px_100px] shadow-black/60"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">תצוגה מקדימה</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="cursor-pointer border-none bg-transparent p-1 text-xl leading-none text-muted"
          >×</button>
        </div>
        <iframe
          title="email-preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          className="min-h-[480px] w-full flex-1 rounded-[12px] border border-line bg-raised"
        />
      </div>
    </div>
  )
}
