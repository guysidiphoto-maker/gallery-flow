// ScrollStorySection — one beat of the scroll story. The copy lives in a clean
// UPPER band (text never sits over a busy render); the 3D product showcases
// below it. Typography is tuned for readability: a controlled emotional hero,
// smaller inner headlines, near-black body inside a comfortable measure, and
// high-contrast chips. Entrance is the shared IO-based <Reveal> (reduced-motion
// safe). The section is pointer-transparent; only the hero CTAs re-enable it.

import type { ReactNode } from 'react'
import { Reveal } from '../ui'
import { color, text, font, space, radius } from '../../theme'
import { FaceScanFrame } from './FaceScanFrame'
import type { Scene } from './scenes'

interface Props {
  scene: Scene
  /** Static fallback path: render the product image inline in the section. */
  image?: boolean
  /** Hero CTAs (or any interactive block) — pointer events re-enabled. */
  children?: ReactNode
}

// Soft cream halo so copy stays crisp even if a floating card drifts near it.
const HALO_H = '0 0 30px rgba(246,243,237,.98), 0 0 12px rgba(246,243,237,.94), 0 1px 2px rgba(246,243,237,.9)'
const HALO_B = '0 0 18px rgba(246,243,237,.98), 0 0 7px rgba(246,243,237,.92)'

function Chips({ tags }: { tags: string[] }) {
  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', justifyContent: 'center', marginTop: space[5] }}>
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            ...text.small,
            fontWeight: 600,
            color: color.ink, // near-black for contrast (accent kept for labels only)
            background: 'rgba(123,143,110,.14)',
            border: `1px solid ${color.accentBorder}`,
            borderRadius: radius.pill,
            padding: '6px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function ScrollStorySection({ scene, image = false, children }: Props) {
  const isHero = scene.id === 'hero'

  const copy = (
    <div
      style={{
        maxWidth: isHero ? 'min(94vw, 820px)' : 'min(94vw, 660px)',
        textAlign: 'center',
        // No inner side padding — the <section> already pads the sides; doubling
        // it squeezed the hero headline into an extra wrapped line on mobile.
        pointerEvents: 'none',
      }}
    >
      <Reveal>
        <div
          style={{
            ...text.label,
            color: color.accent,
            marginBottom: space[3],
            fontSize: 12,
            letterSpacing: '0.14em',
            textShadow: '0 0 12px rgba(246,243,237,.95)',
          }}
        >
          {scene.eyebrow}
        </div>
      </Reveal>

      <Reveal delay={80}>
        <h2
          style={{
            fontFamily: font.display,
            fontWeight: 800,
            // Hero: large but controlled (holds 2 lines on desktop). Inner:
            // strong but clearly smaller, so no section reads as a billboard.
            // Mobile mins kept low enough that each \n line stays on one line.
            fontSize: isHero ? 'clamp(26px, 4.6vw, 56px)' : 'clamp(23px, 3.3vw, 43px)',
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            color: color.ink,
            margin: 0,
            whiteSpace: 'pre-line',
            textShadow: HALO_H,
          }}
        >
          {scene.title}
        </h2>
      </Reveal>

      <Reveal delay={160}>
        <p
          style={{
            ...text.body,
            fontSize: isHero ? 18 : 16.5,
            color: color.inkSoft,
            margin: `${space[4]}px auto 0`,
            maxWidth: isHero ? 620 : 520,
            lineHeight: 1.62,
            textShadow: HALO_B,
          }}
        >
          {scene.body}
        </p>
      </Reveal>

      {scene.tags.length > 0 && (
        <Reveal delay={200}>
          <Chips tags={scene.tags} />
        </Reveal>
      )}

      {/* CTA before the visual so mobile order is headline → CTA → image. */}
      {children && (
        <Reveal delay={240}>
          <div style={{ marginTop: space[6], pointerEvents: 'auto', display: 'flex', justifyContent: 'center', gap: space[3], flexWrap: 'wrap' }}>
            {children}
          </div>
        </Reveal>
      )}

      {scene.trust && (
        <Reveal delay={300}>
          <p style={{ ...text.small, color: color.textMuted, margin: `${space[4]}px auto 0`, maxWidth: 520, textShadow: HALO_B }}>
            {scene.trust}
          </p>
        </Reveal>
      )}

      {image && (
        <Reveal delay={220}>
          {scene.id === 'faces' ? (
            // Face-recognition motif on the mobile/static path (matches the 3D rig).
            <div style={{ maxWidth: 620, margin: `${space[6]}px auto 0` }}>
              <FaceScanFrame>
                <img
                  src={scene.img}
                  alt={scene.alt}
                  loading="lazy"
                  decoding="async"
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </FaceScanFrame>
            </div>
          ) : (
            <img
              src={scene.img}
              alt={scene.alt}
              loading={isHero ? 'eager' : 'lazy'}
              decoding="async"
              style={{
                display: 'block',
                width: '100%',
                maxWidth: 620,
                height: 'auto',
                margin: `${space[6]}px auto 0`,
                borderRadius: radius.lg,
              }}
            />
          )}
        </Reveal>
      )}
    </div>
  )

  return (
    <section
      id={scene.id}
      className="pf-snap"
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: image ? undefined : '100svh',
        display: 'flex',
        // Copy sits HIGH in the band (just under the sticky header) so it always
        // reads clearly above the product, and lands at the top of each snap.
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: `${image ? `${space[7]}px` : isHero ? 'clamp(56px, 5.5vh, 80px)' : 'clamp(60px, 7vh, 96px)'} clamp(20px, 5vw, 64px) ${space[8]}px`,
        pointerEvents: 'none',
      }}
    >
      {copy}
    </section>
  )
}
