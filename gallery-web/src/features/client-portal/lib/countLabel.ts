import type { PortalLocale } from '@/shared/i18n/portalLocale'

export function countLabel(loc: PortalLocale, n: number): string {
  if (n === 1) return loc.t('galleries.count.one')
  return loc.t('galleries.count', { n: loc.fmtNum(n) })
}
