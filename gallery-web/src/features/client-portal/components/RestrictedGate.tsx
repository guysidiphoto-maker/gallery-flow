import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { CenteredCard } from './CenteredCard'
import { CardHeading } from './CardHeading'

/** Fail-closed screen: no membership for this client and no legacy PIN configured. */
export function RestrictedGate({ loc }: { loc: PortalLocale }) {
  return (
    <CenteredCard dir={loc.dir}>
      <CardHeading
        eyebrow={loc.t('portal.badge')}
        title={loc.t('gate.restricted.title')}
        lead={loc.t('gate.restricted.body')}
        leadClassName="mb-2"
      />
    </CenteredCard>
  )
}
