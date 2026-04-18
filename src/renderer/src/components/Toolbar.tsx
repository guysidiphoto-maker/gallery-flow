import React, { useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSocial } from '../store/social'
import { useSections } from '../store/sections'
import { useVendors } from '../store/vendors'
import type { SortMode } from '../types'
import type { ProjectData } from '../App'

interface ToolbarProps {
  currentProject: string | null
  projects: ProjectData[]
  onImport: () => void
  onImportCreate: () => void
  backLabel: string
  onGoBack: () => void
  onGoWorkspace: () => void
  onSwitchProject: (id: string) => void
}

export function Toolbar({ currentProject, projects, onImport, onImportCreate, backLabel, onGoBack, onGoWorkspace, onSwitchProject }: ToolbarProps) {
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
  const { isPanelOpen: isVendorsPanelOpen, togglePanel: toggleVendorsPanel } = useVendors()

  const [showSwitcher, setShowSwitcher] = useState(false)
  const [userName, setUserName] = useState('')

  React.useEffect(() => {
    window.api.getSystemUsername().then(name => { if (name) setUserName(name) })
  }, [])

  const hasImages = images.length > 0
  const pickCount = images.filter(img => topPickIds.has(img.id)).length
  const hasPicks  = pickCount > 0

  return (
    <div className="tb">

      {/* ── Left: contextual back + workspace/recent ── */}
      <div className="tb__left">
        <button
          className="tb__back"
          onClick={onGoBack}
          title={`Back to ${backLabel}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>{backLabel}</span>
        </button>

        <div className="tb__sep" />

        <div className="tb__dropdown">
          <div className="tb__workspace-group">
            <button className="tb__workspace-btn" onClick={onGoWorkspace} title="Go to Workspace">
              <span>Workspace</span>
            </button>
            <button className="tb__workspace-chevron" onClick={() => setShowSwitcher(v => !v)} title="Recent projects">
              <svg className="tb__chevron" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
          {showSwitcher && (
            <>
              <div className="tb__dropdown-overlay" onClick={() => setShowSwitcher(false)}/>
              <div className="tb__dropdown-menu tb__switcher-menu">
                {[...projects]
                  .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
                  .slice(0, 5)
                  .map(p => (
                    <button
                      key={p.id}
                      className={`tb__switcher-item ${currentProject === p.name ? 'tb__switcher-item--active' : ''}`}
                      onClick={() => { setShowSwitcher(false); onSwitchProject(p.id) }}
                    >
                      {p.name}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Center: mode tabs ── */}
      <div className="tb__center">
        {hasImages && (
          <nav className="tb__nav">
            <button
              className={`tb__nav-item ${isSectionsPanelOpen ? 'tb__nav-item--active' : ''}`}
              onClick={toggleSectionsPanel}
            >
              Organize
            </button>
            <button
              className={`tb__nav-item ${hasPicks ? '' : 'tb__nav-item--disabled'}`}
              onClick={hasPicks ? openStoryModal : undefined}
            >
              Story
            </button>
            <button
              className={`tb__nav-item ${hasPicks ? '' : 'tb__nav-item--disabled'}`}
              onClick={hasPicks ? () => { initFromPicks(images, topPickIds); openSocial() } : undefined}
            >
              Post
            </button>
          </nav>
        )}
      </div>

      {/* ── Right: import ── */}
      <div className="tb__right">
        {currentProject && (
          <button className="tb__import" onClick={onImport}>
            Import
          </button>
        )}
      </div>

    </div>
  )
}
