import { useId } from 'react'

// Animated gallery "opening text" (delivery_settings.welcomeMessage). Extracted
// verbatim from the public WelcomeScreen so the SAME experience — typography,
// per-word stagger, timing, RTL detection, animation variants — can be reused
// on the private face-search personalized results screen (no duplicate look).
//
// One behavioral addition over the original inline version: explicit
// prefers-reduced-motion handling (reveal instantly, no per-word animation).
// The keyframe + reduced-motion rule are namespaced per instance (useId) so two
// mounts with different variants/RTL never clobber each other's @keyframes.

export interface OpeningTextProps {
  message: string | null | undefined
  animation?: 'blur' | 'typewriter' | 'slide'
  speed?: 'slow' | 'normal' | 'fast'
  /** Holds the entrance until true — mirrors the welcome screen's `visible`
   *  gate that waits until after mount. Default true (animate immediately). */
  animate?: boolean
  /** Top margin in px. Public welcome uses 24. */
  marginTop?: number
}

export function OpeningText({
  message,
  animation = 'blur',
  speed = 'normal',
  animate = true,
  marginTop = 24,
}: OpeningTextProps) {
  const rawId = useId()
  if (!message || !message.trim()) return null

  const ns = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const kf = `wcWordIn${ns}`       // keyframe name (unique per instance)
  const wc = `wcWord${ns}`         // per-word class (for the reduced-motion rule)

  // Split into tokens: words + line breaks.
  const tokens: Array<{ text: string; isBreak: boolean }> = []
  message.split('\n').forEach((line, li) => {
    if (li > 0) tokens.push({ text: '', isBreak: true })
    line.split(' ').filter(Boolean).forEach(w => tokens.push({ text: w, isBreak: false }))
  })
  const wordCount = tokens.filter(t => !t.isBreak).length || 1
  const msgRTL = /[\u0590-\u05FF\u0600-\u06FF]/.test(message.charAt(0))
  const speedMul = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.6 : 1
  const baseDelay = 0.8 * speedMul
  const perWord = Math.min(0.12, 2 / wordCount) * speedMul
  const wordDuration = animation === 'typewriter' ? 0.3 : animation === 'slide' ? 0.5 : 0.4

  const keyframes: Record<string, string> = {
    blur: `@keyframes ${kf} { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: blur(0); } }`,
    typewriter: `@keyframes ${kf} { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`,
    slide: `@keyframes ${kf} { from { opacity: 0; transform: translateX(${msgRTL ? '20px' : '-20px'}); } to { opacity: 1; transform: translateX(0); } }`,
  }

  let wordIdx = 0
  return (
    <>
      <style>
        {keyframes[animation]}
        {`@media (prefers-reduced-motion: reduce){ .${wc}{ animation: none !important; opacity: 1 !important; filter: none !important; transform: none !important; } }`}
      </style>
      <div style={{
        margin: `${marginTop}px auto 0`, maxWidth: 520, padding: '0 20px',
        direction: msgRTL ? 'rtl' : 'ltr', textAlign: 'center',
      }}>
        <p style={{
          fontSize: 'clamp(15px, 2vw, 20px)',
          color: 'rgba(255,255,255,.7)',
          margin: 0, fontWeight: 400,
          lineHeight: 1.7,
          fontStyle: 'italic',
          letterSpacing: '0.01em',
        }}>
          {tokens.map((token, ti) => {
            if (token.isBreak) return <br key={`br-${ti}`} />
            const wi = wordIdx++
            return (
              <span key={ti} className={wc} style={{
                opacity: 0,
                animation: animate
                  ? `${kf} ${wordDuration}s cubic-bezier(.16,1,.3,1) ${baseDelay + wi * perWord}s both`
                  : 'none',
              }}>
                {token.text}{' '}
              </span>
            )
          })}
        </p>
      </div>
    </>
  )
}
