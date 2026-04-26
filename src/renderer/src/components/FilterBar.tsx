import { useGallery } from '../store/gallery'

interface FilterBarProps {
  /** Show an "Update Changes" button when the live gallery has unsaved edits.
   *  Wired through so the same one-click sync works whether the user is
   *  looking at All Images or any specific section. */
  showUpdateButton?: boolean
  isUpdating?: boolean
  onUpdate?: () => void
}

export function FilterBar({ showUpdateButton, isUpdating, onUpdate }: FilterBarProps = {}) {
  const { searchQuery, dateFilter, setSearchQuery, setDateFilter, clearFilters, images } = useGallery()

  if (images.length === 0) return null

  const hasActiveFilter = !!searchQuery || !!dateFilter.from || !!dateFilter.to

  return (
    <div className="filterbar">
      <div className="filterbar__group">
        <svg className="filterbar__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="filterbar__input"
          type="text"
          placeholder="Filter by filename…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="filterbar__sep" />

      <div className="filterbar__group">
        <span className="filterbar__label">From</span>
        <input
          className="filterbar__date"
          type="date"
          value={dateFilter.from ?? ''}
          onChange={e => setDateFilter({ ...dateFilter, from: e.target.value || null })}
        />
      </div>

      <div className="filterbar__group">
        <span className="filterbar__label">To</span>
        <input
          className="filterbar__date"
          type="date"
          value={dateFilter.to ?? ''}
          onChange={e => setDateFilter({ ...dateFilter, to: e.target.value || null })}
        />
      </div>

      {hasActiveFilter && (
        <button className="filterbar__clear" onClick={clearFilters} title="Clear filters">
          Clear
        </button>
      )}

      {showUpdateButton && (
        <button
          className="filterbar__update"
          onClick={onUpdate}
          disabled={isUpdating}
          title="Sync changes to the live gallery"
        >
          {isUpdating ? (
            <>
              <span className="cg__story-spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />
              Syncing…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Update Changes
            </>
          )}
        </button>
      )}
    </div>
  )
}
