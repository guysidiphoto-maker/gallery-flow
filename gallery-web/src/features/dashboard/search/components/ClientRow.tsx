import type { ClientHit, SearchLocale } from '../searchLogic'
import { t } from '../strings'
import { MatchChips } from './MatchChips'
import { resultRow } from './resultRow'

export function ClientRow({ hit, locale, onOpen }: {
  hit: ClientHit
  locale: SearchLocale
  onOpen: (clientId: string) => void
}) {
  return (
    <button type="button" className={resultRow} onClick={() => onOpen(hit.id)}
      aria-label={`${t(locale, 'search.openClient')}: ${hit.name}`}>
      <span className="flex-1 text-sm font-medium">{hit.name}</span>
      <MatchChips reasons={hit.match_reason} locale={locale} />
    </button>
  )
}
