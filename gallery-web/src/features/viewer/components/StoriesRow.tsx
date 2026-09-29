import type { Story } from '@/shared/types'

/** Instagram-style story circles below the hero; each opens the full-screen StoryPlayer. */
export function StoriesRow({ stories, storyUrl, onOpen }: {
  stories: Story[]
  storyUrl: (st: Story) => string
  onOpen: (index: number) => void
}) {
  return (
    <div
      className="gv-no-scrollbar mx-auto flex max-w-(--viewer-content-max) snap-x snap-proximity items-start gap-[18px] overflow-x-auto px-(--viewer-content-px) py-[clamp(16px,2vw,24px)] max-[601px]:gap-3.5"
      aria-label="Stories"
    >
      {stories.map((st, idx) => (
        <button
          key={st.id}
          type="button"
          className="group flex w-[76px] flex-none snap-start flex-col items-center gap-2 max-[601px]:w-[68px]"
          onClick={() => onOpen(idx)}
          aria-label={`Play story ${st.style}`}
        >
          <span className="gv-story-ring relative block size-[68px] rounded-full p-[2.5px] transition-[scale] duration-200 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none max-[601px]:size-[60px]">
            <video
              className="pointer-events-none block size-full rounded-full border-[2.5px] border-night bg-(--viewer-story-media) object-cover"
              src={storyUrl(st)}
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
            />
            <span
              className="absolute right-px bottom-px flex size-[22px] items-center justify-center rounded-full border-2 border-night bg-gallery-accent text-gallery-accent-ink shadow-[0_2px_6px] shadow-black/35"
              aria-hidden="true"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            </span>
          </span>
          <span className="max-w-[76px] truncate text-center text-[11px] font-medium text-white/62 group-hover:text-white/90 max-[601px]:max-w-[68px] max-[601px]:text-[10.5px]">{st.style}</span>
        </button>
      ))}
    </div>
  )
}
