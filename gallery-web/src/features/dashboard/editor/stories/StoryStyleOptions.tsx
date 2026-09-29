import { cn } from '@/shared/ui'
import { STORY_STYLES } from '../../lib/storyRender'
import { useEditor } from '../EditorContext'

export function StoryStyleOptions() {
  const { storyGen } = useEditor()
  const { storyGenStyle, setStoryGenStyle } = storyGen

  return (
    <div className="mb-[18px] flex flex-col gap-1.5">
      {STORY_STYLES.map(s => {
        const selected = storyGenStyle === s.id
        return (
          <label
            key={s.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 border px-3.5 py-3 transition-[background-color,border-color] duration-150',
              selected ? 'border-ink bg-surface' : 'border-line bg-raised',
            )}
          >
            <input
              type="radio"
              name="story-style"
              value={s.id}
              checked={selected}
              onChange={() => setStoryGenStyle(s.id)}
              className="mt-[3px]"
            />
            <div className="flex-1">
              <div className="mb-0.5 text-[14px] font-medium text-ink">
                {s.label} <span className="font-normal text-muted">— {s.description}</span>
              </div>
              <div className="text-[11px] leading-[1.55] text-muted">
                {s.hint} · ~{s.approxDurationSec} שניות
              </div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
