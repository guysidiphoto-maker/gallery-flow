import React, { useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSocial } from '../store/social'
import { useSections } from '../store/sections'
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
    scanDuplicates,
    prepareApplyOrder,
    openRandomizeModal,
    undoLastRename,
    filenamePrefix,
    setFilenamePrefix,
    isLoading,
    openStoryModal,
  } = useGallery()
  const { openSocial, initFromPicks } = useSocial()
  const { isPanelOpen: isSectionsPanelOpen, togglePanel: toggleSectionsPanel, sections } = useSections()

  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showApplyOptions, setShowApplyOptions] = useState(false)
  const [localPrefix, setLocalPrefix] = useState(filenamePrefix)

  const folderName = folderPath ? folderPath.split('/').pop() : null
  const selectedCount = selectedIds.size
  const hasImages = images.length > 0

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

      {/* ── Left: identity ───────────────────────────────── */}
      <div className="toolbar__left">
        <div className="toolbar__brand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="toolbar__brand-name">GalleryFlow</span>
        </div>

        <div className="toolbar__sep" />

        <button className="btn btn--ghost btn--sm" onClick={openFolder}>
          Open Folder
        </button>

        {folderPath && (
          <button className="btn btn--icon-sq btn--ghost" onClick={reloadFolder} title="Reload folder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}

        {folderName && (
          <>
            <div className="toolbar__sep" />
            <span className="toolbar__folder-name" title={folderPath ?? ''}>{folderName}</span>
          </>
        )}
      </div>

      {/* ── Center: view controls + selection ────────────── */}
      <div className="toolbar__center">
        {hasImages && (
          <div className="toolbar__center-group">

            {/* Selection */}
            {selectedCount > 0 ? (
              <div className="toolbar__group">
                <button className="btn btn--ghost btn--sm" onClick={deselectAll}>Deselect</button>
                <button className="btn btn--danger btn--sm" onClick={deleteSelected}>
                  Delete {selectedCount}
                </button>
              </div>
            ) : (
              <div className="toolbar__group">
                <button className="btn btn--ghost btn--sm" onClick={selectAll}>Select All</button>
              </div>
            )}

            <div className="toolbar__sep" />

            {/* Sort */}
            <div className="dropdown">
              <button className="btn btn--ghost btn--sm" onClick={() => setShowSortMenu(v => !v)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="7" y1="12" x2="21" y2="12" />
                  <line x1="11" y1="18" x2="21" y2="18" />
                </svg>
                Sort
              </button>
              {showSortMenu && (
                <>
                  <div className="dropdown__overlay" onClick={() => setShowSortMenu(false)} />
                  <div className="dropdown__menu">
                    <button onClick={() => handleSort('filename')}>By Filename</button>
                    <button onClick={() => handleSort('date-asc')}>Oldest first</button>
                    <button onClick={() => handleSort('date-desc')}>Newest first</button>
                    <div className="dropdown__divider" />
                    <button onClick={() => handleSort('shuffle')}>Shuffle</button>
                  </div>
                </>
              )}
            </div>

            {/* Size slider */}
            <div className="toolbar__size-control" title="Thumbnail size">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="5" height="5" /><rect x="16" y="3" width="5" height="5" />
                <rect x="3" y="16" width="5" height="5" /><rect x="16" y="16" width="5" height="5" />
              </svg>
              <input
                type="range" min={120} max={400} step={20}
                value={thumbnailSize}
                onChange={e => setThumbnailSize(Number(e.target.value))}
                className="toolbar__slider"
              />
            </div>

            {/* Randomize */}
            {images.length > 1 && (
              <button className="btn btn--icon-sq btn--ghost" onClick={openRandomizeModal} title="Randomize order & rename">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                </svg>
              </button>
            )}

            {/* Duplicates */}
            <button className="btn btn--icon-sq btn--ghost" onClick={scanDuplicates} title="Find duplicates">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="2" width="9" height="9" />
                <rect x="13" y="2" width="9" height="9" />
                <rect x="2" y="13" width="9" height="9" />
                <rect x="13" y="13" width="9" height="9" />
              </svg>
            </button>

          </div>
        )}
      </div>

      {/* ── Right: primary + tools ────────────────────────── */}
      <div className="toolbar__right">
        {hasImages && (
          <>
            {/* Undo */}
            {renameHistory.length > 0 && (
              <button
                className="btn btn--icon-sq btn--ghost"
                onClick={undoLastRename}
                title={`Undo: ${renameHistory[0]?.description}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-5.51" />
                </svg>
              </button>
            )}

            {/* Sections */}
            <button
              className={`btn btn--sm ${isSectionsPanelOpen ? 'btn--sections-active' : 'btn--ghost'}`}
              onClick={toggleSectionsPanel}
              title="Gallery sections"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Sections{sections.length > 0 ? ` (${sections.length})` : ''}
            </button>

            {/* Preview */}
            <button className="btn btn--icon-sq btn--ghost" onClick={togglePreviewMode} title="Client preview">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <div className="toolbar__sep" />

            {/* Apply Order — primary CTA */}
            <div className="dropdown">
              <button
                className="btn btn--apply-order btn--sm"
                onClick={() => setShowApplyOptions(v => !v)}
                title="Apply visual order to filenames"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                Apply Order
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
                      {localPrefix || ''}0001.jpg, {localPrefix || ''}0002.jpg…
                    </div>
                    <div className="dropdown__divider" />
                    <button onClick={() => {
                      setShowApplyOptions(false)
                      setFilenamePrefix(localPrefix)
                      prepareApplyOrder(localPrefix)
                    }}>
                      Preview & Apply…
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="toolbar__sep" />

            {/* Story + Social */}
            {topPickIds.size > 0 && (
              <div className="toolbar__pick-badge" title="Top Picks selected">★ {topPickIds.size}</div>
            )}
            <button
              className={`btn btn--sm ${topPickIds.size > 0 ? 'btn--story' : 'btn--ghost'}`}
              onClick={topPickIds.size > 0 ? openStoryModal : undefined}
              disabled={topPickIds.size === 0}
              title={topPickIds.size > 0 ? `Create story (Cmd+S)` : 'Press T on images to mark top picks'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              Story
            </button>
            <button
              className={`btn btn--sm ${topPickIds.size > 0 ? 'btn--social' : 'btn--ghost'}`}
              onClick={() => { initFromPicks(images, topPickIds); openSocial() }}
              disabled={topPickIds.size === 0}
              title={topPickIds.size > 0 ? `Instagram export` : 'Press T on images to mark top picks'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Social
            </button>
          </>
        )}
      </div>

    </div>
  )
}
