import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted, textPrimary, textSecondary } from '../../styles'
import { useEditor } from '../EditorContext'
import { ActivityStats } from './ActivityStats'
import { DownloadersList } from './DownloadersList'
import { RecentDownloadsList } from './RecentDownloadsList'
import { RecentFavoritesList } from './RecentFavoritesList'
import { RecentEmailsList } from './RecentEmailsList'

export function ActivityTab() {
  const { activity, session } = useEditor()
  const { activitySummary, activityLoading } = activity
  const images = session.galleryImages

  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        Activity
      </div>
      <h3 style={{
        fontSize: 22, fontWeight: 500, margin: '0 0 28px',
        letterSpacing: '-0.015em', color: textPrimary,
      }}>
        פעילות בגלריה
      </h3>

      {activityLoading && !activitySummary ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          color: textMuted, fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          Loading
        </div>
      ) : !activitySummary || (activitySummary.downloads_total === 0 && activitySummary.favorites_total === 0 && activitySummary.emails_total === 0) ? (
        <div style={{
          textAlign: 'center', padding: '80px 24px',
          background: bgSubtle, border: `1px dashed ${border}`,
        }}>
          <Icon name="activity" size={36} strokeWidth={1.2} style={{ opacity: 0.4 }} />
          <p style={{
            marginTop: 16, color: textSecondary, fontSize: 14,
            fontWeight: 500,
          }}>
            עדיין אין פעילות
          </p>
          <p style={{
            marginTop: 6, color: textMuted, fontSize: 11,
            fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            Share gallery · activity will appear here
          </p>
        </div>
      ) : (
        <>
          <ActivityStats summary={activitySummary} />
          {activitySummary.downloaders && activitySummary.downloaders.length > 0 && (
            <DownloadersList downloaders={activitySummary.downloaders} />
          )}
          {activitySummary.recent_downloads.length > 0 && (
            <RecentDownloadsList downloads={activitySummary.recent_downloads} images={images} />
          )}
          {activitySummary.recent_favorites.length > 0 && (
            <RecentFavoritesList favorites={activitySummary.recent_favorites} images={images} />
          )}
          {activitySummary.recent_emails.length > 0 && (
            <RecentEmailsList emails={activitySummary.recent_emails} />
          )}
        </>
      )}
    </div>
  )
}
