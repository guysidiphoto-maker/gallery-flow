import { cn } from '@/shared/ui'
import { Button } from '../ui/Button'
import AssignClientField from './AssignClientField'
import { t, type AssignmentLocale } from './strings'

export function BulkActionBar({
  locale, selectedCount, allVisibleSelected, onToggleAll, onClear,
  bulkClient, onBulkClient, bulkBusy, onRun,
}: {
  locale: AssignmentLocale
  selectedCount: number
  allVisibleSelected: boolean
  onToggleAll: () => void
  onClear: () => void
  bulkClient: string | null
  onBulkClient: (id: string | null) => void
  bulkBusy: boolean
  onRun: () => void
}) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const active = selectedCount > 0
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center gap-3.5 border px-4 py-3 transition-colors duration-150',
        active ? 'border-ink bg-raised/60' : 'border-line bg-surface',
      )}
    >
      <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-soft">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={onToggleAll}
          className="size-[15px] cursor-pointer accent-ink"
        />
        {tr('bulk.selectAll')}
      </label>
      {active && (
        <>
          <span className="text-[12.5px] font-semibold text-ink">
            {selectedCount.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US')} {tr('bulk.selectedCount')}
          </span>
          <button onClick={onClear} className="bg-transparent text-xs text-muted underline">
            {tr('bulk.clearSelection')}
          </button>
          <div className="ms-auto flex max-w-[460px] min-w-[240px] flex-[1_1_320px] items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <AssignClientField value={bulkClient} onChange={id => onBulkClient(id)} allowCreateInline locale={locale} />
            </div>
            <Button variant="primary" busy={bulkBusy} disabled={!bulkClient} onClick={onRun} className="shrink-0 px-[18px] py-[11px]">
              {tr('bulk.assignSelected')} ({selectedCount})
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
