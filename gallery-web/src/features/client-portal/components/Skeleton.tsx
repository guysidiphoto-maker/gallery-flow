// Skeleton — quiet loading placeholders (not a spinner) so the portal shape is
// visible while data loads. Respects prefers-reduced-motion via the shared
// .pf-anim class (the shimmer keyframe is disabled globally under that query).

import type { CSSProperties } from 'react'
import { tokens } from './tokens'

export const skeletonKeyframes = `
  @keyframes pf-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`

function base(style: CSSProperties): CSSProperties {
  return {
    background: `linear-gradient(90deg, ${tokens.bgSubtle} 25%, #EFEBE3 50%, ${tokens.bgSubtle} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'pf-shimmer 1.4s ease-in-out infinite',
    borderRadius: 3,
    ...style,
  }
}

export function SkeletonLine({ width = '100%', height = 12 }: { width?: number | string; height?: number }) {
  return <div className="pf-anim" style={base({ width, height })} />
}

export function GalleryCardSkeleton() {
  return (
    <div style={{ border: `1px solid ${tokens.border}`, background: '#fff' }}>
      <div className="pf-anim" style={base({ aspectRatio: '3 / 2', borderRadius: 0 })} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonLine width="70%" height={14} />
        <SkeletonLine width="45%" height={11} />
        <div style={{ marginTop: 6 }}>
          <SkeletonLine width="100%" height={34} />
        </div>
      </div>
    </div>
  )
}

export function GalleryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 20,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <GalleryCardSkeleton key={i} />
      ))}
    </div>
  )
}
