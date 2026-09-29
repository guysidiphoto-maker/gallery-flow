import type { CSSProperties } from 'react'

// The photographer's animated opening line, shared by the welcome screen and
// the private face-search results hero so both read identically.

export interface OpeningTextProps {
  message: string | null | undefined
  animation?: 'blur' | 'typewriter' | 'slide'
  speed?: 'slow' | 'normal' | 'fast'
  /** Holds the entrance until true. */
  animate?: boolean
  /** Top margin in px. */
  marginTop?: number
}

export function OpeningText({
  message,
  animation = 'blur',
  speed = 'normal',
  animate = true,
  marginTop = 24,
}: OpeningTextProps) {
  if (!message || !message.trim()) return null

  const tokens: Array<{ text: string; isBreak: boolean }> = []
  message.split('\n').forEach((line, li) => {
    if (li > 0) tokens.push({ text: '', isBreak: true })
    line.split(' ').filter(Boolean).forEach(w => tokens.push({ text: w, isBreak: false }))
  })
  const wordCount = tokens.filter(t => !t.isBreak).length || 1
  const msgRTL = /[֐-׿؀-ۿ]/.test(message.charAt(0))
  const speedMul = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.6 : 1
  const baseDelay = 0.8 * speedMul
  const perWord = Math.min(0.12, 2 / wordCount) * speedMul
  const wordDuration = animation === 'typewriter' ? 0.3 : animation === 'slide' ? 0.5 : 0.4
  const keyframe = animation === 'typewriter' ? 'wcWordType'
    : animation === 'slide' ? (msgRTL ? 'wcWordSlideRtl' : 'wcWordSlideLtr')
    : 'wcWordBlur'

  let wordIdx = 0
  return (
    <div
      className="mx-auto mt-(--ot-mt) max-w-[520px] px-5 text-center"
      style={{ '--ot-mt': `${marginTop}px`, direction: msgRTL ? 'rtl' : 'ltr' } as CSSProperties}
    >
      <p className="gv-opening-text-shadow m-0 text-[clamp(15px,2vw,20px)] leading-[1.7] font-normal tracking-[0.01em] text-white/86 italic">
        {tokens.map((token, ti) => {
          if (token.isBreak) return <br key={`br-${ti}`} />
          const wi = wordIdx++
          return (
            <span
              key={ti}
              className="opacity-0 motion-reduce:transform-none! motion-reduce:animate-none! motion-reduce:opacity-100! motion-reduce:filter-none!"
              style={{
                animation: animate
                  ? `${keyframe} ${wordDuration}s cubic-bezier(.16,1,.3,1) ${baseDelay + wi * perWord}s both`
                  : 'none',
              }}
            >
              {token.text}{' '}
            </span>
          )
        })}
      </p>
    </div>
  )
}
