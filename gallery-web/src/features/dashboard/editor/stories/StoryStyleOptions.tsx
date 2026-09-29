import { bgSubtle, border, textMuted, textPrimary } from '../../styles'
import { STORY_STYLES } from '../../lib/storyRender'
import { useEditor } from '../EditorContext'

export function StoryStyleOptions() {
  const { storyGen } = useEditor()
  const { storyGenStyle, setStoryGenStyle } = storyGen

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
      {STORY_STYLES.map(s => {
        const selected = storyGenStyle === s.id
        return (
          <label key={s.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 14px',
            border: `1px solid ${selected ? textPrimary : border}`,
            background: selected ? bgSubtle : '#fff',
            cursor: 'pointer', transition: 'background .15s, border-color .15s',
          }}>
            <input
              type="radio"
              name="story-style"
              value={s.id}
              checked={selected}
              onChange={() => setStoryGenStyle(s.id)}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: textPrimary, marginBottom: 2 }}>
                {s.label} <span style={{ color: textMuted, fontWeight: 400 }}>— {s.description}</span>
              </div>
              <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.55 }}>
                {s.hint} · ~{s.approxDurationSec} שניות
              </div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
