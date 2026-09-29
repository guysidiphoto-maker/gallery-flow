import { useState } from 'react'
import { cn } from '@/shared/ui'

// Blurred, scrimmed, slowly zooming cover behind the password gate and the
// private face-search entry. Decorative; renders null (and calls onFailed) on error.

export interface CoverBackdropProps {
  /** Optimized, small render URL (see gateCoverBackgroundUrl) — never the
   *  original file. Null/empty renders nothing. */
  coverUrl: string | null | undefined
  onFailed?: () => void
}

export function CoverBackdrop({ coverUrl, onFailed }: CoverBackdropProps) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!coverUrl || failed) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <img
        className={cn(
          'absolute inset-0 size-full object-cover [transform:scale(1.08)]',
          'blur-[10px] brightness-[.92] saturate-[1.03] transition-opacity duration-[1.1s] ease-[ease]',
          'animate-[gv-cover-zoom_18s_ease-in-out_infinite_alternate] motion-reduce:animate-none',
          ready ? 'opacity-100' : 'opacity-0',
        )}
        src={coverUrl}
        alt=""
        decoding="async"
        // A cached cover can finish before onLoad is attached; catch it so it still fades in.
        ref={el => { if (el && el.complete && el.naturalWidth > 0) setReady(true) }}
        onLoad={() => setReady(true)}
        onError={() => { setFailed(true); onFailed?.() }}
      />
      <div className="gv-cover-scrim pointer-events-none absolute inset-0 z-0" />
    </div>
  )
}
