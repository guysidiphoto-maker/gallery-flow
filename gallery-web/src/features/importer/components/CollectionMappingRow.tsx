import type { ClientOverviewRow } from '@/features/clients/api'
import type { ImportCollection, T } from '../wizardTypes'
import { Chip, type ChipKind } from './Chip'
import { select } from './theme'

export type RowAction = 'map' | 'create_new' | 'skip' | 'review'

function chipFor(status: string): { kind: ChipKind; key: string } {
  switch (status) {
    case 'matched': return { kind: 'ok', key: 'import.match.matched' }
    case 'ambiguous': return { kind: 'warn', key: 'import.match.ambiguous' }
    case 'create_new': return { kind: 'neutral', key: 'import.match.create_new' }
    case 'skip': return { kind: 'neutral', key: 'import.match.skip' }
    default: return { kind: 'danger', key: 'import.match.unmatched' }
  }
}

const td = 'p-2.5 align-top'
const rowSelect = `${select} max-w-[220px]`

/** One dry-run collection: match chip + action picker + client picker. */
export function CollectionMappingRow({ t, col, busy, clients, onCreateNew, onMap }: {
  t: T
  col: ImportCollection
  busy: boolean
  clients: ClientOverviewRow[]
  onCreateNew: () => void
  onMap: (action: 'map' | 'skip', clientId?: string) => void
}) {
  const chip = chipFor(col.client_match_status)
  const clientName = (col.stats?.client_name as string) || ''
  const actionValue: RowAction =
    col.client_match_status === 'matched' ? 'map'
      : col.client_match_status === 'create_new' ? 'create_new'
        : col.client_match_status === 'skip' ? 'skip' : 'review'

  return (
    <tr className="border-t border-night-line">
      <td className={td}>{col.source_name}</td>
      <td className={td}>{clientName || '—'}</td>
      <td className={td}>
        <Chip kind={chip.kind}>{t(chip.key as never)}</Chip>
      </td>
      <td className={td}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            disabled={busy}
            value={actionValue}
            onChange={e => {
              const v = e.target.value as RowAction
              if (v === 'create_new') onCreateNew()
              else if (v === 'skip') onMap('skip')
              // 'review' / 'map' wait for a manual client pick.
            }}
            className={rowSelect}
          >
            <option value="review">{t('import.action.pickClient')}</option>
            <option value="map">{t('import.action.map')}</option>
            <option value="create_new">{t('import.action.create_new')}</option>
            <option value="skip">{t('import.action.skip')}</option>
          </select>
          <select
            disabled={busy}
            value={col.matched_client_id ?? ''}
            onChange={e => e.target.value && onMap('map', e.target.value)}
            className={rowSelect}
          >
            <option value="">{t('import.action.pickClient')}</option>
            {clients.map(c => (
              <option key={c.client_id} value={c.client_id}>{c.name}</option>
            ))}
          </select>
        </div>
      </td>
    </tr>
  )
}
