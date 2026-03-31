import React, { useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSocial } from '../store/social'
import { useSections } from '../store/sections'
import type { SortMode } from '../types'
import type { ProjectData } from '../App'

interface ToolbarProps {
  currentProject: string | null
  projects: ProjectData[]
  onImport: () => void
  onImportCreate: () => void
  onGoWorkspace: () => void
  onGoClients: () => void
  onSwitchProject: (id: string) => void
}

export function Toolbar({ currentProject, projects, onImport, onImportCreate, onGoWorkspace, onGoClients, onSwitchProject }: ToolbarProps) {
  const {
    folderPath, images, selectedIds, topPickIds, thumbnailSize,
    renameHistory, sortBy, loadExifData,
    selectAll, deselectAll, deleteSelected, setThumbnailSize,
    scanDuplicates,
    undoLastRename, openStoryModal,
    showTopPicksTray, toggleTopPicksTray,
  } = useGallery()
  const { openSocial, initFromPicks } = useSocial()
  const { isPanelOpen: isSectionsPanelOpen, togglePanel: toggleSectionsPanel, sections } = useSections()

  const [showSortMenu,    setShowSortMenu]    = useState(false)
  const [showGridPopover, setShowGridPopover] = useState(false)
  const [showSwitcher,    setShowSwitcher]    = useState(false)
  const [showOpenMenu,    setShowOpenMenu]    = useState(false)
  const [openSearch,      setOpenSearch]      = useState('')

  const selectedCount = selectedIds.size
  const hasImages     = images.length > 0
  const hasPicks      = topPickIds.size > 0

  const handleSort = (mode: SortMode) => {
    setShowSortMenu(false)
    if (mode === 'date-asc' || mode === 'date-desc') loadExifData().then(() => sortBy(mode))
    else sortBy(mode)
  }

  return (
    <div className="tb">

      {/* ── Left: brand + folder ── */}
      <div className="tb__left">
        <div className="tb__brand">
          <svg width="15" height="15" viewBox="0 0 72 72" fill="none">
            <rect x="18" y="18" width="36" height="36" rx="6" stroke="currentColor" strokeWidth="3" opacity="0.6"/>
            <circle cx="27" cy="29" r="3.5" fill="currentColor" opacity="0.5"/>
            <circle cx="36" cy="29" r="3.5" fill="currentColor" opacity="0.5"/>
            <circle cx="45" cy="29" r="3.5" fill="currentColor" opacity="0.5"/>
            <circle cx="27" cy="43" r="3.5" fill="currentColor" opacity="0.5"/>
            <circle cx="36" cy="43" r="3.5" fill="currentColor" opacity="0.5"/>
            <circle cx="45" cy="43" r="5"   fill="currentColor"/>
          </svg>
          <span className="tb__brand-name">Pixflow</span>
        </div>

        <div className="tb__vsep"/>

        {/* Project Switcher */}
        <div className="tb__dropdown">
          <button
            className="tb__switcher"
            onClick={() => setShowSwitcher(v => !v)}
          >
            {currentProject ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{currentProject}</span>
              </>
            ) : (
              <span className="tb__switcher-ws">Workspace</span>
            )}
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{opacity: 0.35}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showSwitcher && (
            <>
              <div className="tb__dropdown-overlay" onClick={() => setShowSwitcher(false)}/>
              <div className="tb__dropdown-menu tb__switcher-menu">
                <button
                  className={`tb__switcher-item ${!currentProject ? 'tb__switcher-item--active' : ''}`}
                  onClick={() => { setShowSwitcher(false); onGoWorkspace() }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                  Workspace
                </button>
                <div className="tb__dropdown-divider"/>
                {projects.map(p => (
                  <button
                    key={p.id}
                    className={`tb__switcher-item ${currentProject === p.name ? 'tb__switcher-item--active' : ''}`}
                    onClick={() => { setShowSwitcher(false); onSwitchProject(p.id) }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    {p.name}
                  </button>
                ))}
                <div className="tb__dropdown-divider"/>
                <button
                  className="tb__switcher-item tb__switcher-item--new"
                  onClick={() => { setShowSwitcher(false); onImportCreate() }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  New Project
                </button>
              </div>
            </>
          )}
        </div>

        <div className="tb__vsep"/>

        <button className="tb__btn tb__btn--clients" onClick={onGoClients}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Clients
        </button>
      </div>

      {/* ── Center: actions ── */}
      <div className="tb__center">
        {hasImages && (
          <div className="tb__group">

            {/* Selection state */}
            {selectedCount > 0 ? (
              <>
                <span className="tb__sel-count">{selectedCount} selected</span>
                <button className="tb__btn" onClick={deselectAll}>Deselect</button>
                <button className="tb__btn tb__btn--danger" onClick={deleteSelected}>Delete</button>
                <div className="tb__vsep"/>
              </>
            ) : (
              <>
                <button className="tb__btn" onClick={selectAll}>Select All</button>
                <div className="tb__vsep"/>
              </>
            )}

            {/* Sort */}
            <div className="tb__dropdown">
              <button className="tb__btn" data-demo="sort" onClick={() => setShowSortMenu(v => !v)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="7" y1="12" x2="21" y2="12"/>
                  <line x1="11" y1="18" x2="21" y2="18"/>
                </svg>
                Sort
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{opacity: 0.35}}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {showSortMenu && (
                <>
                  <div className="tb__dropdown-overlay" onClick={() => setShowSortMenu(false)}/>
                  <div className="tb__dropdown-menu">
                    <button onClick={() => handleSort('filename')}>By Filename</button>
                    <button onClick={() => handleSort('date-asc')}>Oldest first</button>
                    <button onClick={() => handleSort('date-desc')}>Newest first</button>
                    <div className="tb__dropdown-divider"/>
                    <button onClick={() => { setShowSortMenu(false); scanDuplicates() }}>Find Duplicates</button>
                  </div>
                </>
              )}
            </div>

            {/* Grid size — subtle icon popover */}
            <div className="tb__dropdown">
              <button
                className="tb__btn tb__btn--icon tb__btn--subtle"
                title="Thumbnail size"
                onClick={() => setShowGridPopover(v => !v)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              </button>
              {showGridPopover && (
                <>
                  <div className="tb__dropdown-overlay" onClick={() => setShowGridPopover(false)}/>
                  <div className="tb__dropdown-menu tb__dropdown-menu--wide">
                    <div className="tb__dropdown-label">Thumbnail size</div>
                    <div className="tb__slider-wrap" style={{padding: '2px 0 4px'}}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4">
                        <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
                        <rect x="3" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/>
                      </svg>
                      <input
                        type="range" min={120} max={400} step={20}
                        value={thumbnailSize}
                        onChange={e => setThumbnailSize(Number(e.target.value))}
                        className="tb__slider"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Right: modes + export ── */}
      <div className="tb__right">

        {hasImages && (
          <>
            {/* Undo */}
            {renameHistory.length > 0 && (
              <button
                className="tb__btn tb__btn--icon"
                onClick={undoLastRename}
                title={`Undo: ${renameHistory[0]?.description}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-5.51"/>
                </svg>
              </button>
            )}

            {/* Sections */}
            <button
              className={`tb__btn ${isSectionsPanelOpen ? 'tb__btn--active' : ''}`}
              data-demo="sections"
              onClick={toggleSectionsPanel}
              title="Sections"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Sections{sections.length > 0 ? ` (${sections.length})` : ''}
            </button>

            {/* Top picks tray */}
            {hasPicks && (
              <button
                className={`tb__btn ${showTopPicksTray ? 'tb__btn--active' : ''}`}
                onClick={toggleTopPicksTray}
                title="Top Picks (T)"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Picks
                <span className="tb__badge">{topPickIds.size}</span>
              </button>
            )}

            <div className="tb__vsep"/>

            {/* Story + Social */}
            <div className="tb__export-cluster">
              <button
                className={`tb__btn ${hasPicks ? 'tb__btn--story' : ''}`}
                data-demo="story"
                onClick={hasPicks ? openStoryModal : undefined}
                disabled={!hasPicks}
                title={hasPicks ? `Story from ${topPickIds.size} picks` : 'Press T to mark top picks'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                Story
              </button>
              <button
                className={`tb__btn ${hasPicks ? 'tb__btn--social' : ''}`}
                onClick={() => { initFromPicks(images, topPickIds); openSocial() }}
                disabled={!hasPicks}
                title={hasPicks ? `Export ${topPickIds.size} picks` : 'Press T to mark top picks'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                </svg>
                Post
              </button>
            </div>

            <div className="tb__vsep"/>
          </>
        )}

        {/* Open project */}
        <div className="tb__dropdown">
          <button className="tb__btn tb__btn--open-project" onClick={() => setShowOpenMenu(v => !v)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Open
          </button>
          {showOpenMenu && (
            <>
              <div className="tb__dropdown-overlay" onClick={() => { setShowOpenMenu(false); setOpenSearch('') }}/>
              <div className="tb__dropdown-menu tb__open-menu">
                <div className="tb__open-search-wrap">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    className="tb__open-search"
                    type="text"
                    placeholder="Search projects…"
                    value={openSearch}
                    onChange={e => setOpenSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="tb__open-label">Recent Projects</div>
                <div className="tb__open-list">
                  {projects
                    .filter(p => p.name.toLowerCase().includes(openSearch.toLowerCase()))
                    .map(p => (
                    <button
                      key={p.id}
                      className={`tb__open-item ${currentProject === p.name ? 'tb__open-item--active' : ''}`}
                      onClick={() => { setShowOpenMenu(false); setOpenSearch(''); onSwitchProject(p.id) }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      {p.name}
                    </button>
                  ))}
                  {projects.filter(p => p.name.toLowerCase().includes(openSearch.toLowerCase())).length === 0 && (
                    <div className="tb__open-empty">No projects found</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Import */}
        <button className="tb__btn tb__btn--import" onClick={onImport}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Import
        </button>
      </div>

    </div>
  )
}
