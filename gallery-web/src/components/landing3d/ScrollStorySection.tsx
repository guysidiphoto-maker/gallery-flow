// ScrollStorySection — one full-height beat of the scroll story. Every beat is
// CENTERED: a bold catalog-style headline sits in a frosted cream "clearing" in
// the middle of the 3D field (or beside/over a static product card in the
// fallback path). The frosted scrim keeps the copy crisp over a busy product
// shot while the 3D stays visible all around it.
//
// The section is pointer-transparent so wheel/touch scrolling passes through;
// only interactive children (hero CTAs) re-enable pointer events. Entrance is
// the shared IO-based <Reveal> (reduced-motion safe), never scroll-pinning.

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

function TagPills({ tags }: { tags: string[] }) {
  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', justifyContent: 'center', marginTop: space[5] }}>
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            ...text.small,
            fontWeight: 600,
            color: color.accentHover,
            background: 'rgba(123,143,110,.12)',
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
        maxWidth: isHero ? 600 : 520,
        textAlign: 'center',
        padding: `${space[6]}px ${space[6]}px`,
        borderRadius: radius.xl,
        // Frosted cream clearing that HUGS the copy: crisp text, while the hero
        // render + floating cards frame it on every side.
        background:
          'radial-gradient(85% 108% at 50% 44%, rgba(246,243,237,.93) 0%, rgba(246,243,237,.74) 46%, rgba(246,243,237,.18) 74%, rgba(246,243,237,0) 100%)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
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
          }}
        >
          {scene.eyebrow}
        </div>
      </Reveal>

      <Reveal delay={80}>
        <h2
          style={{
            ...(isHero ? text.display : text.h1),
            // Bolder + larger than the base scale — "catalog prominent".
            fontFamily: font.display,
            fontWeight: 800,
            fontSize: isHero ? 'clamp(44px, 7vw, 84px)' : 'clamp(34px, 5vw, 60px)',
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
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
            fontSize: isHero ? 19 : 17,
            color: color.inkSoft,
            margin: `${space[4]}px auto 0`,
            maxWidth: 520,
            lineHeight: 1.65,
          }}
        >
          {scene.body}
        </p>
      </Reveal>

      <Reveal delay={200}>
        <TagPills tags={scene.tags} />
      </Reveal>

      {image && (
        <Reveal delay={220}>
          <img
            src={scene.img}
            alt={scene.alt}
            loading={isHero ? 'eager' : 'lazy'}
            decoding="async"
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 640,
              height: 'auto',
              margin: `${space[6]}px auto 0`,
              borderRadius: radius.lg,
            }}
          />
        </Reveal>
      )}

      {children && (
        <Reveal delay={260}>
          <div style={{ marginTop: space[6], pointerEvents: 'auto', display: 'flex', justifyContent: 'center' }}>
            {children}
          </div>
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
        justifyContent: 'center',
        padding: `${space[8]}px clamp(20px, 5vw, 64px)`,
        pointerEvents: 'none',
      }}
    >
      {copy}
    </section>
  )
}
