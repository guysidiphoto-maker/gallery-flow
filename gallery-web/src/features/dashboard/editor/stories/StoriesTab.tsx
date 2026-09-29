import { bgSubtle, border, textMuted, textPrimary, textSecondary } from '../../styles'
import { useEditor } from '../EditorContext'
import { UploadProgressStrip } from '../UploadProgressStrip'
import { StoryActions } from './StoryActions'
import { StoriesEmptyState } from './StoriesEmptyState'
import { StoryTile } from './StoryTile'

export function StoriesTab() {
  const { session, stories } = useEditor()
  const { storyUploading, storyUploadProgress } = stories

  return (
    <div style={{ padding: '0 4px' }}>
      {/* First render after a cold start takes ~60-90s. */}
      <div style={{
        marginBottom: 18, padding: '10px 14px',
        border: `1px dashed ${border}`, background: bgSubtle,
        fontSize: 12, color: textSecondary, lineHeight: 1.55,
      }}>
        <strong style={{ color: textPrimary }}>✓ יצירה אוטומטית מופעלת.</strong>
        &nbsp;לחיצה על "צור סטורי אוטומטית" תרכיב סרטון מהתמונות שלך תוך 60-90 שניות.
        רוצה לעלות סרטון מוכן? השתמשי בכפתור <strong>העלאת סטורי</strong> משמאל.
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <h3 style={{
          fontSize: 22, fontWeight: 500, margin: 0,
          letterSpacing: '-0.015em', color: textPrimary,
        }}>
          סטורי
          <span style={{
            marginInlineStart: 12, color: textMuted,
            fontSize: 14, fontWeight: 400,
          }}>
            {session.stories.length}
          </span>
        </h3>
        <StoryActions />
      </div>

      <p style={{
        fontSize: 13, color: textSecondary,
        marginBottom: 22, lineHeight: 1.6,
      }}>
        העלו סרטון MP4 שיוצג בנגן הסטורי המלא של הגלריה.
        גודל מקסימלי: 100MB.
      </p>

      {storyUploading && storyUploadProgress && (
        <UploadProgressStrip
          label={
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', maxWidth: '70%',
            }}>
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
        <div className="dash-stories-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}>
          {session.stories.map(st => <StoryTile key={st.id} story={st} />)}
        </div>
      )}
    </div>
  )
}
