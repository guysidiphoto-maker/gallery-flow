import React, { useState } from 'react'

interface MissingFilesBannerProps {
  missingCount: number
  onLocate: () => Promise<{ relinked: number; stillMissing: number; cancelled?: boolean } | null>
  onDismiss?: () => void
}

/**
 * Floating banner shown at the top of the workspace whenever the renderer
 * detects that referenced image files no longer exist on disk. Mirrors the
 * Lightroom "Locate Folder" pattern: pick a folder, the main process walks
 * it for matching basenames, the registry is rewritten with the new paths.
 */
export function MissingFilesBanner({ missingCount, onLocate, onDismiss }: MissingFilesBannerProps) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ relinked: number; stillMissing: number } | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await onLocate()
      if (r && !r.cancelled) {
        setResult({ relinked: r.relinked, stillMissing: r.stillMissing })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 50,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9000,
      background: 'rgba(20,20,28,.96)',
      border: '1px solid rgba(251,191,36,.35)',
      borderRadius: 12,
      padding: '11px 14px 11px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 12px 36px rgba(0,0,0,.55), 0 0 0 1px rgba(251,191,36,.1)',
      backdropFilter: 'blur(20px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      animation: 'wsd-fade .25s ease both',
      maxWidth: 'calc(100vw - 80px)',
    }}>
      {/* Warning icon */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: 'rgba(251,191,36,.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      {/* Message */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,.95)',
          letterSpacing: '-0.005em',
          whiteSpace: 'nowrap',
        }}>
          {result
            ? result.stillMissing === 0
              ? `Relinked ${result.relinked} ${result.relinked === 1 ? 'photo' : 'photos'}.`
              : `Relinked ${result.relinked}, ${result.stillMissing} still missing.`
            : `${missingCount} ${missingCount === 1 ? 'photo' : 'photos'} missing`}
        </div>
        {!result && (
          <div style={{
            fontSize: 11.5,
            color: 'rgba(255,255,255,.45)',
            marginTop: 1,
            whiteSpace: 'nowrap',
          }}>
            Source files were moved or renamed. Choose the new folder to relink.
          </div>
        )}
      </div>

      {/* Locate button */}
      {!result && (
        <button
          onClick={handleClick}
          disabled={busy}
          style={{
            padding: '7px 14px',
            background: busy ? 'rgba(251,191,36,.6)' : '#fbbf24',
            border: 'none',
            borderRadius: 8,
            color: '#0a0a0f',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            letterSpacing: '0.01em',
            transition: 'background .15s, transform .1s',
          }}
          onMouseEnter={e => { if (!busy) e.currentTarget.style.background = '#fcd34d' }}
          onMouseLeave={e => { if (!busy) e.currentTarget.style.background = '#fbbf24' }}
        >
          {busy ? (
            <>
              <div style={{
                width: 12,
                height: 12,
                border: '2px solid rgba(10,10,15,.3)',
                borderTopColor: '#0a0a0f',
                borderRadius: '50%',
                animation: 'spin .6s linear infinite',
              }} />
              Searching…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Locate folder
            </>
          )}
        </button>
      )}

      {/* Dismiss / close — appears after a result or as a way to hide */}
      <button
        onClick={() => { setResult(null); onDismiss?.() }}
        title="Dismiss"
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.85)'; e.currentTarget.style.background = 'rgba(255,255,255,.08)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)'; e.currentTarget.style.background = 'transparent' }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
