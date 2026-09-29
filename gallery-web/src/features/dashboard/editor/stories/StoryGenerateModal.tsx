import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'
import { StoryCurator } from './StoryCurator'
import { StoryStyleOptions } from './StoryStyleOptions'
import { StoryRenderEstimate } from './StoryRenderEstimate'
import { STORY_GENERATE_MAX_PHOTOS, STORY_GENERATE_MIN_PHOTOS } from './useStoryGeneration'
import '../editor.css'

// Style picker + shot-list curator before requesting a render.
export function StoryGenerateModal() {
  const { storyGen } = useEditor()
  const { storyGenerating, storyCandidateIds, closeGenerateModal } = storyGen
  const dialogRef = useFocusTrap<HTMLDivElement>(true, closeGenerateModal)

  const count = storyCandidateIds?.length ?? 0
  const blocked = count < STORY_GENERATE_MIN_PHOTOS || count > STORY_GENERATE_MAX_PHOTOS
  const confirmDisabled = storyGenerating || blocked

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        closeGenerateModal()
      }}
      className="fixed inset-0 z-[1200] flex animate-[fade-in_.2s_ease_both] items-center justify-center bg-ink/55 backdrop-blur-[6px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-style-heading"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-32px)] w-[calc(100vw-40px)] max-w-[460px] animate-[editor-modal-in_.25s_ease_both] flex-col border border-line bg-raised"
      >
        {/* Scrollable body + fixed footer keeps the CTAs reachable on small viewports. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-3">
          <div className="mb-3.5 text-[11px] font-medium tracking-wide-label text-muted uppercase">
            Story generator
          </div>
          <h3 id="story-style-heading" className="mt-0 mb-3.5 text-[22px] leading-[1.15] font-medium tracking-[-0.015em] text-ink">
            איזה סגנון סטורי?
          </h3>
          <StoryCurator />
          <StoryStyleOptions />
          <StoryRenderEstimate />
        </div>
        <div className="flex shrink-0 justify-end gap-2.5 border-t border-line bg-raised px-7 pt-3.5 pb-[18px]">
          <button
            onClick={closeGenerateModal}
            disabled={storyGenerating}
            className={cn(
              'rounded-hair border py-[11px] text-[11px] font-medium tracking-label uppercase border-line bg-transparent px-[22px] text-ink',
              storyGenerating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
          >
            ביטול
          </button>
          <button
            onClick={() => { void storyGen.handleGenerateStoryConfirm() }}
            disabled={confirmDisabled}
            className={cn(
              'rounded-hair border py-[11px] text-[11px] font-medium tracking-label uppercase border-ink bg-ink px-[26px] text-white',
              storyGenerating ? 'cursor-wait' : blocked ? 'cursor-not-allowed' : 'cursor-pointer',
              confirmDisabled && 'opacity-55',
            )}
          >
            {storyGenerating ? 'מייצר…' : `צור סטורי · ${count}`}
          </button>
        </div>
      </div>
    </div>
  )
}
