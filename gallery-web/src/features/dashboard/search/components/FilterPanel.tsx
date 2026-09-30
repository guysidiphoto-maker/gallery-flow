import { Input, Select } from '@/shared/ui'
import { EMPTY_FILTER_STATE, buildFilterPayload, hasActiveFilters } from '../searchLogic'
import type { SearchFilterState, SearchLocale } from '../searchLogic'
import { t } from '../strings'

export function FilterPanel({ filters, onChange, clientOptions, locale }: {
  filters: SearchFilterState
  onChange: (next: SearchFilterState) => void
  clientOptions: Array<{ id: string; name: string }>
  locale: SearchLocale
}) {
  const tr = (key: string) => t(locale, key)
  const set = <K extends keyof SearchFilterState>(key: K, value: SearchFilterState[K]) =>
    onChange({ ...filters, [key]: value })

  const field = 'rounded-[4px] px-2.5 py-2 text-[13px]'
  const label = 'mb-[5px] block text-[11px] font-medium tracking-[0.06em] text-muted uppercase'

  return (
    <div className="mb-[18px] rounded-[4px] border border-line bg-surface p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
        {clientOptions.length > 0 && (
          <label>
            <span className={label}>{tr('filter.client')}</span>
            <Select className={field} value={filters.clientId}
              onChange={e => set('clientId', e.target.value)}>
              <option value="">{tr('filter.any')}</option>
              {clientOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </Select>
          </label>
        )}
        <label>
          <span className={label}>{tr('filter.status')}</span>
          <Select className={field} value={filters.status}
            onChange={e => set('status', e.target.value as SearchFilterState['status'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="live">{tr('filter.status.live')}</option>
            <option value="draft">{tr('filter.status.draft')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.assigned')}</span>
          <Select className={field} value={filters.assigned}
            onChange={e => set('assigned', e.target.value as SearchFilterState['assigned'])}>
            <option value="all">{tr('filter.any')}</option>
            <option value="yes">{tr('filter.assigned.yes')}</option>
            <option value="no">{tr('filter.assigned.no')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.eventType')}</span>
          <Input className={field} type="text" value={filters.eventType} maxLength={60}
            placeholder={tr('filter.eventType.ph')}
            onChange={e => set('eventType', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.size')}</span>
          <Select className={field} value={filters.eventSizeBucket}
            onChange={e => set('eventSizeBucket', e.target.value as SearchFilterState['eventSizeBucket'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="intimate">{tr('filter.size.intimate')}</option>
            <option value="small">{tr('filter.size.small')}</option>
            <option value="medium">{tr('filter.size.medium')}</option>
            <option value="large">{tr('filter.size.large')}</option>
            <option value="massive">{tr('filter.size.massive')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.industry')}</span>
          <Input className={field} type="text" value={filters.industry} maxLength={60}
            placeholder={tr('filter.industry.ph')}
            onChange={e => set('industry', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.venue')}</span>
          <Select className={field} value={filters.venueType}
            onChange={e => set('venueType', e.target.value as SearchFilterState['venueType'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="indoor">{tr('filter.venue.indoor')}</option>
            <option value="outdoor">{tr('filter.venue.outdoor')}</option>
            <option value="mixed">{tr('filter.venue.mixed')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.time')}</span>
          <Select className={field} value={filters.timeOfDay}
            onChange={e => set('timeOfDay', e.target.value as SearchFilterState['timeOfDay'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="day">{tr('filter.time.day')}</option>
            <option value="night">{tr('filter.time.night')}</option>
            <option value="mixed">{tr('filter.time.mixed')}</option>
          </Select>
        </label>
        <label>
          <span className={label}>{tr('filter.yearFrom')}</span>
          <Input className={field} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearFrom} placeholder="2024"
            onChange={e => set('yearFrom', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.yearTo')}</span>
          <Input className={field} type="number" inputMode="numeric" min={2000} max={2100}
            value={filters.yearTo} placeholder="2026"
            onChange={e => set('yearTo', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.keywords')}</span>
          <Input className={field} type="text" value={filters.keywords}
            placeholder={tr('filter.keywords.ph')}
            onChange={e => set('keywords', e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr('filter.imported')}</span>
          <Select className={field} value={filters.importedSource}
            onChange={e => set('importedSource', e.target.value as SearchFilterState['importedSource'])}>
            <option value="">{tr('filter.any')}</option>
            <option value="pixieset">{tr('filter.imported.pixieset')}</option>
            <option value="generic_csv">{tr('filter.imported.generic_csv')}</option>
            <option value="local_folder">{tr('filter.imported.local_folder')}</option>
          </Select>
        </label>
      </div>
      <div className="mt-3.5 text-end">
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER_STATE)}
          disabled={!hasActiveFilters(buildFilterPayload(filters))}
          className="cursor-pointer rounded-[4px] border border-line bg-transparent px-3.5 py-2 text-xs text-ink-soft"
        >
          {t(locale, 'search.clearFilters')}
        </button>
      </div>
    </div>
  )
}
