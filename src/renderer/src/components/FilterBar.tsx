import { useGallery } from '../store/gallery'

export function FilterBar() {
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
    </div>
  )
}
