import type { ReactNode } from 'react'
import type { GallerySection as Section } from '@/shared/types'
import { sectionAnchor } from '../lib/sectionPaging'

/** One chapter: heading with photo count, optional caption, then its grid. scroll-mt clears the sticky nav. */
export function GallerySection({ section, count, children }: { section: Section; count: number; children: ReactNode }) {
  return (
    <section id={sectionAnchor(section.id)} className="mt-[clamp(48px,6vw,72px)] scroll-mt-20 px-(--viewer-content-px) max-[641px]:mt-10">
      <h2 className="gv-section-heading relative mx-auto mb-[clamp(18px,2.4vw,28px)] flex max-w-(--viewer-content-max) items-baseline justify-between gap-3.5 pb-3.5">
        <span className="flex-1 text-[clamp(19px,2.2vw,26px)] font-bold tracking-[-0.018em] text-gallery-text">{section.name}</span>
        <span className="rounded-full bg-(--viewer-neutral)/10 px-2.5 py-[3px] text-[11px] font-medium tracking-[0.12em] text-gallery-muted uppercase">
          {count} {count === 1 ? 'photo' : 'photos'}
        </span>
      </h2>
      {section.description && (
        <p className="mb-6 max-w-[56ch] text-[14px] leading-[1.6] font-normal text-gallery-muted max-[641px]:mb-[18px] max-[641px]:text-[13px]">{section.description}</p>
      )}
      {children}
    </section>
  )
}
