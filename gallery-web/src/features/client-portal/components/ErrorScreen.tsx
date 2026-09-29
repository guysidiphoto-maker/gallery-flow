import { Eyebrow } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { CenteredCard } from './CenteredCard'

export function ErrorScreen({ loc, message }: { loc: PortalLocale; message: string }) {
  return (
    <CenteredCard dir={loc.dir} className="max-w-[420px] px-9 py-10">
      <Eyebrow className="mb-3.5 block">{loc.t('error.title')}</Eyebrow>
      <p className="text-[15px] leading-normal text-ink">{message}</p>
    </CenteredCard>
  )
}
