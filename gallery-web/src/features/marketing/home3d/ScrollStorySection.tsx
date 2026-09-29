// One beat of the homepage scroll story: copy in a clean upper band, the product
// (3D canvas, or an inline image on the static path) below it. The section is
// pointer-transparent; only the hero CTAs re-enable pointer events.

import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { Reveal } from '../components/ui'
import { FaceScanFrame } from './FaceScanFrame'
import { StoryChips } from './StoryChips'
import type { Scene } from './scenes'

interface Props {
  scene: Scene
  /** Static fallback path: render the product image inline. */
  image?: boolean
  /** Hero CTAs (or any interactive block). */
  children?: ReactNode
}

export function ScrollStorySection({ scene, image = false, children }: Props) {
  const isHero = scene.id === 'hero'

  return (
    <section
      id={scene.id}
      className={cn(
        'pointer-events-none relative z-[1] flex items-start justify-center px-[clamp(20px,5vw,64px)] pb-16',
        !image && 'min-h-svh',
        image ? 'pt-12' : isHero ? 'pt-[clamp(78px,9vh,112px)]' : 'pt-[clamp(92px,12vh,150px)]',
      )}
    >
      {/* No inner side padding: doubling it wrapped the hero headline on mobile. */}
      <div className={cn('pointer-events-none text-center', isHero ? 'max-w-[min(94vw,820px)]' : 'max-w-[min(94vw,660px)]')}>
        <Reveal>
          <div className="mk-label mb-3 text-[12px] tracking-[0.14em] text-sage [text-shadow:var(--mk-halo-eyebrow)]">
            {scene.eyebrow}
          </div>
        </Reveal>

        <Reveal delay={80}>
          {/* Mobile mins keep each \n line on one line. */}
          <h2
            className={cn(
              'm-0 font-(family-name:--mk-font-display) font-extrabold tracking-[-0.025em] whitespace-pre-line text-ink [text-shadow:var(--mk-halo-h)]',
              isHero ? 'text-[clamp(26px,4.6vw,56px)]' : 'text-[clamp(23px,3.3vw,43px)]',
              'leading-[1.1]',
            )}
          >
            {scene.title}
          </h2>
        </Reveal>

        <Reveal delay={160}>
          <p
            className={cn(
              'mk-body mx-auto mt-4 text-(--mk-ink-soft) [text-shadow:var(--mk-halo-b)]',
              isHero ? 'max-w-[620px] text-[18px]' : 'max-w-[520px] text-[16.5px]',
              'leading-[1.62]',
            )}
          >
            {scene.body}
          </p>
        </Reveal>

        {scene.tags.length > 0 && (
          <Reveal delay={200}>
            <StoryChips tags={scene.tags} />
          </Reveal>
        )}

        {/* CTA before the visual so mobile order is headline → CTA → image. */}
        {children && (
          <Reveal delay={240}>
            <div className="pointer-events-auto mt-8 flex flex-wrap justify-center gap-3">{children}</div>
          </Reveal>
        )}

        {scene.trust && (
          <Reveal delay={300}>
            <p className="mk-small mx-auto mt-4 max-w-[520px] text-muted [text-shadow:var(--mk-halo-b)]">{scene.trust}</p>
          </Reveal>
        )}

        {image && (
          <Reveal delay={220}>
            {scene.id === 'faces' ? (
              <div className="mx-auto mt-8 max-w-[620px]">
                <FaceScanFrame>
                  <img src={scene.img} alt={scene.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
                </FaceScanFrame>
              </div>
            ) : (
              <img
                src={scene.img}
                alt={scene.alt}
                loading={isHero ? 'eager' : 'lazy'}
                decoding="async"
                className="mx-auto mt-8 block h-auto w-full max-w-[620px] rounded-[18px]"
              />
            )}
          </Reveal>
        )}
      </div>
    </section>
  )
}
