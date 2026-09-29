import { useState } from 'react'

// Cinematic cover background — the premium private-entry treatment (elegant
// blur + dark scrim + soft vignette + slow zoom, reduced-motion aware). Shared
// by the PasswordGate and the private face-search locked welcome screen so both
// use ONE implementation (styles live in .cover-backdrop* in styles.css).
//
// Decorative only (aria-hidden). Fades in once the image decodes; a cached
// image that finishes before React attaches onLoad is caught by the ref check.
// On load failure it renders null and calls onFailed so the parent can fall
// back to its flat background.

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
    <div className={`cover-backdrop${ready ? ' cover-backdrop--ready' : ''}`} aria-hidden="true">
      <img
        className="cover-backdrop__img"
        src={coverUrl}
        alt=""
        decoding="async"
        // A cached cover can finish before React attaches onLoad — the ref
        // check catches that so it still fades in (else it stays invisible).
        ref={el => { if (el && el.complete && el.naturalWidth > 0) setReady(true) }}
        onLoad={() => setReady(true)}
        onError={() => { setFailed(true); onFailed?.() }}
      />
      <div className="cover-backdrop__scrim" />
    </div>
  )
}
