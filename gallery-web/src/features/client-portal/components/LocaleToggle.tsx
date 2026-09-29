import { cn } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { focusRing } from '../lib/focusRing'

/** he/en switch; labelled with the language you switch TO. */
export function LocaleToggle({ loc }: { loc: PortalLocale }) {
  return (
    <button
      type="button"
      onClick={loc.toggle}
      aria-label={loc.t('lang.label')}
      className={cn(
        'rounded-full border border-line-soft bg-white px-3 py-[7px] text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-ink-soft',
        'transition-colors duration-150',
        focusRing,
      )}
    >
      {loc.t('lang.toggle')}
    </button>
  )
}
