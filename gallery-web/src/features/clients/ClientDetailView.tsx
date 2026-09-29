import { Icon } from '@/shared/ui/Icon'
import type { ToastInput } from '@/shared/ui/Toast'
import { portalUrl } from './lib/portalUrl'
import { useClientDetail } from './detail/useClientDetail'
import { GalleriesSection } from './detail/GalleriesSection'
import { MembersSection } from './detail/MembersSection'
import { InvitationsSection } from './detail/InvitationsSection'
import { ActivitySection } from './detail/ActivitySection'
import { InviteModal } from './detail/InviteModal'
import { LinkResultModal } from './detail/LinkResultModal'
import { BackLink } from './ui/BackLink'
import { Button } from './ui/Button'
import { CopyField } from './ui/CopyField'
import { ErrorBanner } from './ui/ErrorBanner'
import { Section } from './ui/Section'
import { Skeleton } from './ui/Skeleton'
import { Stat } from './ui/Stat'

interface Props {
  clientId: string
  businessSlug: string | null
  onBack: () => void
  showToast: (t: ToastInput) => void
}

export function ClientDetailView({ clientId, businessSlug, onBack, showToast }: Props) {
  const d = useClientDetail(clientId, showToast)

  const backButton = (
    <BackLink onClick={onBack}>
      {/* RTL: the flipped icon points to the inline-end to mean "back". */}
      <span className="inline-flex -scale-x-100">
        <Icon name="logout" size={14} strokeWidth={1.8} />
      </span>
      חזרה לרשימת הלקוחות
    </BackLink>
  )

  if (d.loading) {
    return <div>{backButton}<Skeleton height={80} count={5} /></div>
  }
  if (d.loadError || !d.detail) {
    return <div>{backButton}<ErrorBanner text={d.loadError ?? 'הלקוח לא נמצא.'} onRetry={d.load} /></div>
  }

  const { client, galleries, members, invitations, audit } = d.detail
  const pendingInvites = invitations.filter(i => i.status === 'pending')
  const activeMembers = members.filter(m => m.status === 'active').length

  return (
    <div>
      <d.ConfirmHost />
      {backButton}

      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="mb-2.5 text-[11px] font-medium tracking-wide-label text-muted uppercase">לקוח</div>
          <h1 className="text-[clamp(26px,3.4vw,40px)] font-medium tracking-[-0.025em] text-ink">{client.name}</h1>
          {client.slug && (
            <div dir="ltr" className="mt-1.5 text-right text-[12.5px] text-muted">/{client.slug}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="ghost"
            icon="gallery"
            onClick={() => window.open(portalUrl(businessSlug, clientId), '_blank', 'noopener,noreferrer')}
            title="נפתח בלשונית חדשה"
          >
            תצוגה מקדימה כלקוח (עמוד ציבורי)
          </Button>
        </div>
      </div>

      <Section title="פורטל הלקוח">
        <div className="mb-4">
          <CopyField label="קישור לפורטל הציבורי" value={portalUrl(businessSlug, clientId)} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border border-line bg-surface">
          <Stat label="גלריות משויכות" value={galleries.length} />
          <Stat label="משתמשי לקוח" value={members.length} />
          <Stat label="פעילים" value={activeMembers} />
          <Stat label="הזמנות ממתינות" value={pendingInvites.length} />
        </div>
      </Section>

      <GalleriesSection
        clientId={clientId}
        galleries={galleries}
        activeMembers={activeMembers}
        filter={d.galleryFilter}
        onFilter={d.setGalleryFilter}
      />

      <MembersSection
        members={members}
        busyId={d.busyId}
        onInvite={() => { d.invite.setError(null); d.invite.setOpen(true) }}
        onInviteFromEmpty={() => d.invite.setOpen(true)}
        onReset={d.doReset}
        onSetStatus={d.doSetStatus}
      />

      {pendingInvites.length > 0 && (
        <InvitationsSection
          invitations={pendingInvites}
          busyId={d.busyId}
          onResend={d.doResend}
          onCancel={d.doCancelInvite}
        />
      )}

      <ActivitySection audit={audit} />

      <InviteModal form={d.invite} />
      <LinkResultModal result={d.linkResult} onClose={() => d.setLinkResult(null)} />
    </div>
  )
}
