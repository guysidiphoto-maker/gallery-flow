import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import type { GallerySection } from '@/shared/types'
import { ALL_IMAGES_ANCHOR, sectionAnchor } from '../lib/sectionPaging'
import { NavPill } from './SectionNavPill'

/**
 * Sticky three-slot bar: section pills (start), an optional center slot and
 * the download/select toolbar (end). Stacks below 900px, where pills and
 * actions would otherwise collide.
 */
export function SectionNav({
  sections, sectionCounts, totalCount, showAllPill, allPillLabel, allPillCount, activeId, onJump, centerToolbar, toolbar,
}: {
  sections: GallerySection[]
  sectionCounts: Record<string, number>
  totalCount: number
  showAllPill?: boolean
  allPillLabel?: string
  allPillCount?: number
  activeId: string
  onJump: (id: string) => void
  centerToolbar?: ReactNode
  toolbar?: ReactNode
}) {
  const hasSections = sections.length > 0
  return (
    <nav
      className="sticky top-0 z-60 border-b border-white/6 bg-night/80 backdrop-blur-[24px] backdrop-saturate-150"
      role="navigation"
      aria-label="Gallery sections"
    >
      <div
        className={cn(
          'mx-auto grid max-w-(--viewer-content-max) grid-cols-[1fr_auto_1fr] items-center gap-4 overflow-hidden px-(--viewer-content-px) py-2.5',
          'max-[901px]:grid-cols-1 max-[901px]:gap-2 max-[641px]:px-3',
        )}
      >
        <div className="gv-no-scrollbar flex min-w-0 items-center gap-1.5 justify-self-start overflow-x-auto max-[901px]:justify-self-stretch">
          {hasSections && sections.map(sec => (
            <NavPill
              key={sec.id}
              label={sec.name}
              count={sectionCounts[sec.id] ?? 0}
              active={activeId === sectionAnchor(sec.id)}
              onClick={() => onJump(sectionAnchor(sec.id))}
            />
          ))}
          {hasSections && showAllPill && (
            <NavPill
              label={allPillLabel ?? 'All Photos'}
              count={allPillCount ?? totalCount}
              active={activeId === ALL_IMAGES_ANCHOR}
              onClick={() => onJump(ALL_IMAGES_ANCHOR)}
            />
          )}
        </div>
        <div className="flex min-w-0 items-center justify-self-center max-[901px]:hidden">{centerToolbar}</div>
        {/* Scrolls within its own lane when select mode widens it, instead of overlapping the pills. */}
        <div className="gv-no-scrollbar flex min-w-0 items-center gap-2 justify-self-end overflow-x-auto *:shrink-0 max-[901px]:gap-1.5 max-[901px]:justify-self-stretch">
          {toolbar}
        </div>
      </div>
    </nav>
  )
}
