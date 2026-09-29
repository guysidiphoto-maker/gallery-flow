import { Icon } from '@/shared/ui/Icon'
import { Eyebrow } from '@/shared/ui'
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
      <Eyebrow className="mb-2.5 block">פעילות</Eyebrow>
      <h3 className="mb-7 text-[22px] font-medium tracking-[-0.015em] text-ink">
        פעילות בגלריה
      </h3>

      {activityLoading && !activitySummary ? (
        <div className="py-[60px] text-center text-xs font-medium text-muted">
          טוען פעילות…
        </div>
      ) : !activitySummary || (activitySummary.downloads_total === 0 && activitySummary.favorites_total === 0 && activitySummary.emails_total === 0) ? (
        <div className="border border-dashed border-line bg-surface px-6 py-20 text-center">
          <Icon name="activity" size={36} strokeWidth={1.2} className="mx-auto opacity-40" />
          <p className="mt-4 text-[14px] font-medium text-ink-soft">
            עדיין אין פעילות
          </p>
          <p className="mt-1.5 text-xs text-muted">
            שתפו את הגלריה, וההורדות, המועדפים והמיילים יופיעו כאן
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
