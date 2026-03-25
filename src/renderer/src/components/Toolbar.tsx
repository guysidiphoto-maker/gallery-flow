import React, { useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSocial } from '../store/social'
import { useSections } from '../store/sections'
import { useDemo } from '../store/demo'
import type { SortMode } from '../types'

export function Toolbar() {
  const {
    folderPath,
    images,
    selectedIds,
    topPickIds,
    thumbnailSize,
    renameHistory,
    openFolder,
    reloadFolder,
    sortBy,
    loadExifData,
    selectAll,
    deselectAll,
    deleteSelected,
    setThumbnailSize,
    togglePreviewMode,
    toggleDuplicatesPanel,
    scanDuplicates,
    prepareApplyOrder,
    randomizeOrder,
    undoLastRename,
    filenamePrefix,
    setFilenamePrefix,
    isLoading,
    openStoryModal,
    clearTopPicks
  } = useGallery()
  const { openSocial, initFromPicks } = useSocial()
  const { isPanelOpen: isSectionsPanelOpen, togglePanel: toggleSectionsPanel, sections } = useSections()
  const { phase: demoPhase, startDemo, stopDemo } = useDemo()

  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showApplyOptions, setShowApplyOptions] = useState(false)
  const [localPrefix, setLocalPrefix] = useState(filenamePrefix)

  const folderName = folderPath ? folderPath.split('/').pop() : null
  const selectedCount = selectedIds.size

  const handleSort = (mode: SortMode) => {
    setShowSortMenu(false)
    if (mode === 'date-asc' || mode === 'date-desc') {
      loadExifData().then(() => sortBy(mode))
    } else {
      sortBy(mode)
    }
  }

  return (
    <div className="toolbar">
      {/* Left: App identity */}
      <div className="toolbar__left">
        <div className="toolbar__logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>GalleryFlow</span>
        </div>

        <button className="btn btn--primary" onClick={openFolder}>
          Open Folder
        </button>

        {folderPath && (
          <button className="btn btn--ghost btn--icon" onClick={reloadFolder} title="Reload folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}

        {/* Demo button */}
        {demoPhase === 'idle' ? (
          <button
            className="btn btn--demo"
            onClick={startDemo}
            title="Run a cinematic demo of GalleryFlow features"
          >
            ▶ Demo
          </button>
        ) : demoPhase === 'running' ? (
          <button className="btn btn--demo" onClick={stopDemo}>
            ■ Stop
          </button>
        ) : null}
      </div>

      {/* Center: Folder path + image count */}
      <div className="toolbar__center">
        {folderName && (
          <div className="toolbar__folder-info">
            <span className="toolbar__folder-name" title={folderPath ?? ''}>
              {folderName}
            </span>
            <span className="toolbar__count">
              {isLoading ? 'Loading...' : `${images.length} images`}
              {selectedCount > 0 && ` · ${selectedCount} selected`}
            </span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="toolbar__right">
        {selectedCount > 0 && (
          <>
            <button className="btn btn--ghost" onClick={deselectAll}>
              Deselect
            </button>
            <button className="btn btn--danger" onClick={deleteSelected}>
              Delete {selectedCount}
            </button>
          </>
        )}

        {selectedCount === 0 && images.length > 0 && (
          <button className="btn btn--ghost" onClick={selectAll}>
            Select All
          </button>
        )}

        {/* Sort dropdown */}
        {images.length > 0 && (
          <div className="dropdown">
            <button
              className="btn btn--ghost"
              onClick={() => setShowSortMenu(v => !v)}
            >
              Sort ▾
            </button>
            {showSortMenu && (
              <>
                <div className="dropdown__overlay" onClick={() => setShowSortMenu(false)} />
                <div className="dropdown__menu">
                  <button onClick={() => handleSort('filename')}>By Filename</button>
                  <button onClick={() => handleSort('date-asc')}>By Date (oldest first)</button>
                  <button onClick={() => handleSort('date-desc')}>By Date (newest first)</button>
                  <div className="dropdown__divider" />
                  <button onClick={() => handleSort('shuffle')}>Shuffle</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Thumbnail size slider */}
        {images.length > 0 && (
          <div className="toolbar__size-control" title="Thumbnail size">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="5" height="5" />
              <rect x="16" y="3" width="5" height="5" />
              <rect x="3" y="16" width="5" height="5" />
              <rect x="16" y="16" width="5" height="5" />
            </svg>
            <input
              type="range"
              min={120}
              max={400}
              step={20}
              value={thumbnailSize}
              onChange={e => setThumbnailSize(Number(e.target.value))}
              className="toolbar__slider"
            />
          </div>
        )}

        {/* Randomize order */}
        {images.length > 1 && (
          <button
            className="btn btn--ghost"
            onClick={randomizeOrder}
            title="Shuffle images and rename files to match new order"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
            </svg>
            Randomize
          </button>
        )}

        {/* Duplicates */}
        {images.length > 0 && (
          <button className="btn btn--ghost" onClick={scanDuplicates} title="Detect duplicates">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="9" height="9" />
              <rect x="13" y="2" width="9" height="9" />
              <rect x="2" y="13" width="9" height="9" />
              <rect x="13" y="13" width="9" height="9" />
            </svg>
            Duplicates
          </button>
        )}

        {/* Apply order */}
        {images.length > 0 && (
          <div className="dropdown">
            <button
              className="btn btn--accent"
              onClick={() => setShowApplyOptions(v => !v)}
              title="Apply current visual order to filenames"
            >
              Apply Order ▾
            </button>
            {showApplyOptions && (
              <>
                <div className="dropdown__overlay" onClick={() => setShowApplyOptions(false)} />
                <div className="dropdown__menu dropdown__menu--wide">
                  <div className="dropdown__label">Optional prefix</div>
                  <input
                    className="dropdown__input"
                    type="text"
                    placeholder="e.g. wedding_"
                    value={localPrefix}
                    onChange={e => setLocalPrefix(e.target.value)}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="dropdown__preview-example">
                    Preview: {localPrefix || ''}0001.jpg, {localPrefix || ''}0002.jpg…
                  </div>
                  <div className="dropdown__divider" />
                  <button onClick={() => {
                    setShowApplyOptions(false)
                    setFilenamePrefix(localPrefix)
                    prepareApplyOrder(localPrefix)
                  }}>
                    Preview & Apply...
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Undo */}
        {renameHistory.length > 0 && (
          <button
            className="btn btn--ghost"
            onClick={undoLastRename}
            title={`Undo: ${renameHistory[0]?.description}`}
          >
            ↩ Undo
          </button>
        )}

        {/* Sections */}
        {images.length > 0 && (
          <button
            className={`btn ${isSectionsPanelOpen ? 'btn--accent' : 'btn--ghost'}`}
            onClick={toggleSectionsPanel}
            title="Manage gallery sections"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Sections{sections.length > 0 ? ` (${sections.length})` : ''}
          </button>
        )}

        {/* Preview mode */}
        {images.length > 0 && (
          <button
            className="btn btn--ghost btn--icon"
            onClick={togglePreviewMode}
            title="Client preview mode"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}

        {/* Story Video — always show when images loaded */}
        {images.length > 0 && (
          <div className="toolbar__story-group">
            {topPickIds.size > 0 && (
              <div className="toolbar__pick-badge" title="Top Picks selected">
                ★ {topPickIds.size}
              </div>
            )}
            <button
              className={`btn ${topPickIds.size > 0 ? 'btn--story' : 'btn--ghost'}`}
              onClick={topPickIds.size > 0 ? openStoryModal : undefined}
              disabled={topPickIds.size === 0}
              title={topPickIds.size > 0
                ? `Create story from ${topPickIds.size} top picks (Cmd+S)`
                : 'Select top picks first — press T on any image'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Create Story
            </button>

            <button
              className={`btn ${topPickIds.size > 0 ? 'btn--social' : 'btn--ghost'}`}
              onClick={() => { initFromPicks(images, topPickIds); openSocial() }}
              disabled={topPickIds.size === 0}
              title={topPickIds.size > 0
                ? `Instagram mode — ${topPickIds.size} top picks`
                : 'Select top picks first'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Social
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
