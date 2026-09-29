import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { border, textMuted, textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'
import { StoryCurator } from './StoryCurator'
import { StoryStyleOptions } from './StoryStyleOptions'
import { StoryRenderEstimate } from './StoryRenderEstimate'
import { STORY_GENERATE_MAX_PHOTOS, STORY_GENERATE_MIN_PHOTOS } from './useStoryGeneration'

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
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'overlayIn .2s ease both',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-style-heading"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', width: 'calc(100vw - 40px)', maxWidth: 460,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${border}`,
          animation: 'modalIn .25s ease both',
        }}
      >
        {/* Scrollable body + fixed footer keeps the CTAs reachable on small viewports. */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '24px 28px 12px',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 14,
          }}>
            Story generator
          </div>
          <h3 id="story-style-heading" style={{
            fontSize: 22, fontWeight: 500, margin: '0 0 14px',
            color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.15,
          }}>
            איזה סגנון סטורי?
          </h3>
          <StoryCurator />
          <StoryStyleOptions />
          <StoryRenderEstimate />
        </div>
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          padding: '14px 28px 18px',
          borderTop: `1px solid ${border}`, background: '#fff',
          flexShrink: 0,
        }}>
          <button
            onClick={closeGenerateModal}
            disabled={storyGenerating}
            style={{
              background: 'transparent', color: textPrimary,
              border: `1px solid ${border}`,
              borderRadius: 2, padding: '11px 22px', fontSize: 11,
              cursor: storyGenerating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
              opacity: storyGenerating ? 0.5 : 1,
            }}
          >
            ביטול
          </button>
          <button
            onClick={() => { void storyGen.handleGenerateStoryConfirm() }}
            disabled={confirmDisabled}
            style={{
              background: textPrimary, color: '#fff',
              border: `1px solid ${textPrimary}`,
              borderRadius: 2, padding: '11px 26px', fontSize: 11,
              cursor: storyGenerating ? 'wait' : blocked ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              opacity: confirmDisabled ? 0.55 : 1,
            }}
          >
            {storyGenerating ? 'מייצר…' : `צור סטורי · ${count}`}
          </button>
        </div>
      </div>
    </div>
  )
}
