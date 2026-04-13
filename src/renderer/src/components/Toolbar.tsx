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

      {/* ── Left: identity ── */}
      <div className="tb__left">
        <div className="tb__brand-block">
          <svg className="tb__brand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4.5" stroke="#6366f1" strokeWidth="1.5"/>
            <circle cx="8.5" cy="9" r="2" fill="#6366f1" opacity="0.6"/>
            <path d="M3 16l5-4.5 3.5 3 4-3.5L21 16v3a4.5 4.5 0 01-4.5 4.5h-9A4.5 4.5 0 013 19v-3z" fill="#6366f1" opacity="0.2"/>
          </svg>
          <div className="tb__brand-text">
            <span className="tb__brand-name">Pixflow</span>
            {userName && <span className="tb__brand-user">{userName}</span>}
          </div>
        </div>

        {/* Project name */}
        <div className="tb__dropdown">
          <button className="tb__project" onClick={() => setShowSwitcher(v => !v)}>
            <span className="tb__project-label">{currentProject || 'Workspace'}</span>
            <svg className="tb__chevron" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  Workspace
                </button>
                <button className="tb__switcher-item" onClick={() => { setShowSwitcher(false); onGoClients() }}>
                  Clients
                </button>
                <div className="tb__dropdown-divider"/>
                {projects.map(p => (
                  <button
                    key={p.id}
                    className={`tb__switcher-item ${currentProject === p.name ? 'tb__switcher-item--active' : ''}`}
                    onClick={() => { setShowSwitcher(false); onSwitchProject(p.id) }}
                  >
                    {p.name}
                  </button>
                ))}
                <div className="tb__dropdown-divider"/>
                <button className="tb__switcher-item tb__switcher-item--new" onClick={() => { setShowSwitcher(false); onImportCreate() }}>
                  + New Project
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Center: empty — breathing room ── */}
      <div className="tb__center" />

      {/* ── Right: mode tabs (the star) + import ── */}
      <div className="tb__right">
        {hasImages && (
          <nav className="tb__nav">
            <button
              className={`tb__nav-item ${!isSectionsPanelOpen ? 'tb__nav-item--active' : ''}`}
              onClick={() => { if (isSectionsPanelOpen) toggleSectionsPanel() }}
            >
              Gallery
            </button>
            <button
              className={`tb__nav-item ${isSectionsPanelOpen ? 'tb__nav-item--active' : ''}`}
              onClick={() => { if (!isSectionsPanelOpen) toggleSectionsPanel() }}
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
            <button
              className={`tb__nav-item ${isVendorsPanelOpen ? 'tb__nav-item--active' : ''}`}
              onClick={toggleVendorsPanel}
            >
              Vendors
            </button>
          </nav>
        )}

        {hasImages && (
          <button className="tb__import" onClick={onImport}>
            Import
          </button>
        )}
      </div>

    </div>
  )
}
