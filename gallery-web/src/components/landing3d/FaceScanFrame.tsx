// FaceScanFrame — the face-recognition motif for the static / mobile path.
// Wraps the faces product image in a viewfinder: sage corner brackets plus a
// small cluster of pulsing recognition nodes. Speaks the same language as the
// desktop 3D rig. No sweeping scan line (by request). Respects reduced-motion.

import type { ReactNode } from 'react'
import { color, radius } from '../../theme'

const ARM = 30
const B = 3
const INSET = 12

function corner(v: 'top' | 'bottom', h: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [v]: INSET,
    [h]: INSET,
    width: ARM,
    height: ARM,
    [v === 'top' ? 'borderTop' : 'borderBottom']: `${B}px solid ${color.accent}`,
    [h === 'left' ? 'borderLeft' : 'borderRight']: `${B}px solid ${color.accent}`,
    borderRadius:
      v === 'top' && h === 'left' ? '10px 0 0 0'
        : v === 'top' && h === 'right' ? '0 10px 0 0'
        : v === 'bottom' && h === 'left' ? '0 0 0 10px'
        : '0 0 10px 0',
    opacity: 0.9,
    pointerEvents: 'none',
  }
}

// Rough face-landmark positions (relative to the frame) for the node cluster.
const NODES: Array<{ x: number; y: number; d: number }> = [
  { x: 44, y: 40, d: 0 },
  { x: 56, y: 40, d: 0.4 },
  { x: 50, y: 50, d: 0.8 },
  { x: 45, y: 60, d: 1.2 },
  { x: 55, y: 60, d: 1.6 },
]

export function FaceScanFrame({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'relative', borderRadius: radius.lg, overflow: 'hidden' }}>
      <style>{`
        @keyframes pfNode { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity:.55 } 50% { transform: translate(-50%,-50%) scale(1.5); opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .pf-node { animation: none !important; } }
      `}</style>
      {children}
      {/* Corner brackets (viewfinder) */}
      <div style={corner('top', 'left')} />
      <div style={corner('top', 'right')} />
      <div style={corner('bottom', 'left')} />
      <div style={corner('bottom', 'right')} />
      {/* Recognition nodes */}
      {NODES.map((n, i) => (
        <span
          key={i}
          className="pf-node"
          aria-hidden
          style={{
            position: 'absolute',
            left: `${n.x}%`,
            top: `${n.y}%`,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color.accent,
            boxShadow: `0 0 8px ${color.accent}`,
            transform: 'translate(-50%,-50%)',
            animation: `pfNode 2.4s ease-in-out ${n.d}s infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}
      {/* Small "recognized" tag */}
      <span
        style={{
          position: 'absolute', insetInlineEnd: 14, top: 14,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: radius.pill,
          background: 'rgba(123,143,110,.92)', color: color.onAccent,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
          pointerEvents: 'none',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        זוהה
      </span>
    </div>
  )
}
