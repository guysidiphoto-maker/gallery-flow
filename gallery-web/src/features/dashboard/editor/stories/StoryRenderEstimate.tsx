import {
  STORY_DEFAULT_PHOTO_BUDGET, STORY_MIN_PHOTOS, STORY_STYLES,
  estimateRenderSeconds, formatStoryDuration,
} from '../../lib/storyRender'
import { useEditor } from '../EditorContext'

// Calibrated estimate from the current shot count + style; updates as the list is edited.
export function StoryRenderEstimate() {
  const { storyGen } = useEditor()
  const { storyCandidateIds, storyGenStyle } = storyGen
  const count = (storyCandidateIds?.length ?? STORY_DEFAULT_PHOTO_BUDGET)
  const estSec = estimateRenderSeconds(Math.max(count, STORY_MIN_PHOTOS), storyGenStyle)

  return (
    <div className="mb-[22px] border border-dashed border-line px-3 py-2.5 text-[12px] leading-[1.55] text-muted">
      <strong className="text-ink-soft">זמן רינדור משוער: {formatStoryDuration(estSec)}</strong>
      &nbsp;עבור {count} תמונות בסגנון {STORY_STYLES.find(s => s.id === storyGenStyle)?.label ?? storyGenStyle}. הסטורי יישמר בגלריה כשיהיה מוכן ותקבל הודעה — אפשר לעזוב את המסך.
    </div>
  )
}
