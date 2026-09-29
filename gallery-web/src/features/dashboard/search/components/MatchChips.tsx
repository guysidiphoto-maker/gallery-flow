import { matchReasonStringKey } from '../searchLogic'
import type { SearchLocale } from '../searchLogic'
import { t } from '../strings'

export function MatchChips({ reasons, locale }: { reasons: string[]; locale: SearchLocale }) {
  if (reasons.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted">{t(locale, 'search.matched')}</span>
      {reasons.map(reason => (
        <span key={reason} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
          {t(locale, matchReasonStringKey(reason))}
        </span>
      ))}
    </span>
  )
}
