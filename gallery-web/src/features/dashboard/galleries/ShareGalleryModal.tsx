import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import type { ShareGalleryState } from '../hooks/useShareGallery'
import { cn } from '@/shared/ui'
import type { ActivitySummary } from '../types'
import { ShareLinkBox } from './ShareLinkBox'
import { ShareEmailForm } from './ShareEmailForm'
import { RecentRecipients } from './RecentRecipients'

// Share Center: public link, email send, and recent recipients.
export function ShareGalleryModal({ share, shareUrl, activitySummary, activityLoading }: {
  share: ShareGalleryState
  shareUrl: (g: { id: string; slug?: string | null }) => string
  activitySummary: ActivitySummary | null
  activityLoading: boolean
}) {
  const { shareSending, shareSent } = share
  const ref = useFocusTrap<HTMLDivElement>(true, () => { if (!share.shareSending) share.setShareGallery(null) })
  const shareGallery = share.shareGallery!
  const url = shareUrl(shareGallery)
  const isLive = (shareGallery.status ?? '') === 'live'

  return (
    <div
      onClick={() => !shareSending && share.setShareGallery(null)}
      className="z-[2100] fixed inset-0 flex animate-[dash-overlay-in_.2s_ease_both] items-center justify-center bg-black/78 p-5 backdrop-blur-[10px]"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-share-heading"
        onClick={e => e.stopPropagation()}
        className="dash-mobile-modal max-w-[520px] p-8 w-full animate-[dash-modal-in_.3s_ease_both] rounded-[22px] border border-line bg-canvas shadow-[0_30px_100px] shadow-black/60"
      >
        <div className="mb-1.5 flex items-start justify-between">
          <h2 id="email-share-heading" className="text-[22px] font-bold tracking-[-0.02em]">
            מרכז שיתוף
          </h2>
          <button
            onClick={() => share.setShareGallery(null)}
            disabled={shareSending}
            aria-label="סגירה"
            className={cn(
              'border-none bg-transparent p-1 text-xl leading-none text-muted',
              shareSending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
          >×</button>
        </div>
        <p className="mb-[18px] text-[13px] leading-normal text-ink-soft">
          שיתוף הגלריה <strong>{shareGallery.name}</strong> — קישור ציבורי, שליחה במייל, ונמענים אחרונים.
        </p>

        <ShareLinkBox
          url={url}
          isLive={isLive}
          copied={share.shareLinkCopied}
          onCopy={() => share.copyShareLink(url, shareGallery.id)}
        />

        {shareSent ? (
          <div className="rounded-[14px] border border-success/25 bg-success/8 px-5 py-8 text-center text-success">
            <div className="mb-2 text-4xl">✓</div>
            <div className="text-[15px] font-bold">המייל נשלח</div>
          </div>
        ) : (
          <ShareEmailForm share={share} />
        )}

        <RecentRecipients activitySummary={activitySummary} activityLoading={activityLoading} />
      </div>
    </div>
  )
}
