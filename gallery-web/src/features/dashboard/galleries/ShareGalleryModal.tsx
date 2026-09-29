import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import type { ShareGalleryState } from '../hooks/useShareGallery'
import { bg, border, textMuted, textSecondary } from '../styles'
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
      style={{
        position: 'fixed', inset: 0, zIndex: 2100,
        background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'overlayIn .2s ease both',
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-share-heading"
        onClick={e => e.stopPropagation()}
        className="dash-mobile-modal"
        style={{
          background: bg, width: '100%', maxWidth: 520,
          borderRadius: 22, padding: 32,
          border: `1px solid ${border}`,
          animation: 'modalIn .3s ease both',
          boxShadow: '0 30px 100px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 id="email-share-heading" style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            מרכז שיתוף
          </h2>
          <button onClick={() => share.setShareGallery(null)} disabled={shareSending} aria-label="סגירה" style={{
            background: 'transparent', border: 'none', color: textMuted, fontSize: 20,
            cursor: shareSending ? 'not-allowed' : 'pointer', lineHeight: 1, padding: 4,
            opacity: shareSending ? 0.5 : 1,
          }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: textSecondary, margin: '0 0 18px', lineHeight: 1.5 }}>
          שיתוף הגלריה <strong>{shareGallery.name}</strong> — קישור ציבורי, שליחה במייל, ונמענים אחרונים.
        </p>

        <ShareLinkBox
          url={url}
          isLive={isLive}
          copied={share.shareLinkCopied}
          onCopy={() => share.copyShareLink(url, shareGallery.id)}
        />

        {shareSent ? (
          <div style={{
            padding: '32px 20px', textAlign: 'center',
            background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)',
            borderRadius: 14, color: '#4ade80',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>המייל נשלח</div>
          </div>
        ) : (
          <ShareEmailForm share={share} />
        )}

        <RecentRecipients activitySummary={activitySummary} activityLoading={activityLoading} />
      </div>
    </div>
  )
}
