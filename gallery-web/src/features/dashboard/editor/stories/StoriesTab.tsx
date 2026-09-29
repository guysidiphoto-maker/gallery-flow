import { useEditor } from '../EditorContext'
import { UploadProgressStrip } from '../UploadProgressStrip'
import { StoryActions } from './StoryActions'
import { StoriesEmptyState } from './StoriesEmptyState'
import { StoryTile } from './StoryTile'

export function StoriesTab() {
  const { session, stories } = useEditor()
  const { storyUploading, storyUploadProgress } = stories

  return (
    <div className="px-1">
      {/* First render after a cold start takes ~60-90s. */}
      <div className="mb-[18px] border border-dashed border-line bg-surface px-3.5 py-2.5 text-[12px] leading-[1.55] text-ink-soft">
        <strong className="text-ink">✓ יצירה אוטומטית מופעלת.</strong>
        &nbsp;לחיצה על "צור סטורי אוטומטית" תרכיב סרטון מהתמונות שלך תוך 60-90 שניות.
        רוצה לעלות סרטון מוכן? השתמשי בכפתור <strong>העלאת סטורי</strong> משמאל.
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="m-0 text-[22px] font-medium tracking-[-0.015em] text-ink">
          סטורי
          <span className="ms-3 text-[14px] font-normal text-muted">
            {session.stories.length}
          </span>
        </h3>
        <StoryActions />
      </div>

      <p className="mb-[22px] text-[13px] leading-[1.6] text-ink-soft">
        העלו סרטון MP4 שיוצג בנגן הסטורי המלא של הגלריה.
        גודל מקסימלי: 100MB.
      </p>

      {storyUploading && storyUploadProgress && (
        <UploadProgressStrip
          label={
            <span className="max-w-[70%] truncate">
              מעלה: {storyUploadProgress.filename}
            </span>
          }
          aside={<span>{storyUploadProgress.pct}%</span>}
          pct={storyUploadProgress.pct}
        />
      )}

      {session.stories.length === 0 && !storyUploading ? (
        <StoriesEmptyState />
      ) : (
        <div className="dash-stories-grid grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {session.stories.map(st => <StoryTile key={st.id} story={st} />)}
        </div>
      )}
    </div>
  )
}
