// ScrollStorySection — one full-height beat of the scroll story. Pure HTML/CSS
// overlay that sits ON TOP of the fixed 3D canvas (in the 3D path) or beside a
// static product image (in the fallback path). The copy column carries a soft
// cream scrim so text stays readable over the busy centre of a product shot.
//
// The section itself is pointer-transparent so wheel/touch scrolling passes
// through to the page; only interactive children (hero CTAs) re-enable pointer
// events. Entrance is handled by the shared IO-based <Reveal> (reduced-motion
// safe), never by scroll-pinning.

import type { ReactNode } from 'react'
import { Reveal } from '../ui'
import { color, text, font, space, radius } from '../../theme'
import type { Scene } from './scenes'

interface Props {
  scene: Scene
  /** Static fallback path: render the product image inline in the section. */
  image?: boolean
  /** Hero CTAs (or any interactive block) — pointer events re-enabled. */
  children?: ReactNode
}

export function ScrollStorySection({ scene, image = false, children }: Props) {
  const isHero = scene.id === 'hero'
  const justify =
    scene.side === 'center' ? 'center' : scene.side === 'end' ? 'flex-end' : 'flex-start'

  const copy = (
    <div
      style={{
        maxWidth: isHero ? 560 : 440,
        textAlign: scene.side === 'center' ? 'center' : 'start',
        padding: `${space[6]}px ${space[6]}px`,
        borderRadius: radius.xl,
        // Soft cream scrim: readable over the 3D image without hiding it.
        background:
          scene.side === 'center'
            ? 'radial-gradient(120% 120% at 50% 40%, rgba(246,243,237,.82) 0%, rgba(246,243,237,0) 72%)'
            : 'linear-gradient(var(--pf-scrim-dir, 90deg), rgba(246,243,237,.9) 0%, rgba(246,243,237,.72) 55%, rgba(246,243,237,0) 100%)',
        backdropFilter: 'blur(1.5px)',
        WebkitBackdropFilter: 'blur(1.5px)',
        pointerEvents: 'none',
      }}
    >
      {scene.eyebrow && (
        <Reveal>
          <div
            style={{
              ...text.label,
              color: color.accent,
              marginBottom: space[3],
            }}
          >
            {scene.eyebrow}
          </div>
        </Reveal>
      )}

      <Reveal delay={80}>
        <h2
          style={{
            ...(isHero ? text.display : text.h1),
            fontFamily: font.display,
            color: color.ink,
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          {scene.title}
        </h2>
      </Reveal>

      <Reveal delay={160}>
        <p
          style={{
            ...text.body,
            fontSize: isHero ? 18 : 16,
            color: color.inkSoft,
            margin: `${space[4]}px 0 0`,
            maxWidth: 440,
            lineHeight: 1.65,
          }}
        >
          {scene.body}
        </p>
      </Reveal>

      {image && (
        <Reveal delay={200}>
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
        </Reveal>
      )}

      {children && (
        <Reveal delay={240}>
          <div style={{ marginTop: space[6], pointerEvents: 'auto' }}>{children}</div>
        </Reveal>
      )}
    </div>
  )

  return (
    <section
      id={scene.id}
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: image ? undefined : '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        padding: `${space[8]}px clamp(20px, 6vw, 96px)`,
        pointerEvents: 'none',
        // Flip the linear scrim so it fades AWAY from the copy, toward the image.
        ['--pf-scrim-dir' as string]: scene.side === 'end' ? '270deg' : '90deg',
      }}
    >
      {copy}
    </section>
  )
}
