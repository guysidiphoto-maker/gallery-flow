import React, { useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSections } from '../store/sections'
import { useGallery } from '../store/gallery'

function DroppableSectionItem({
  sec,
  idx,
  isActive,
  count,
  editingId,
  editingName,
  setEditingName,
  commitEdit,
  handleEditKeyDown,
  startEdit,
  deleteSection,
  setActiveSectionFilter
}: {
  sec: { id: string; name: string }
  idx: number
  isActive: boolean
  count: number
  editingId: string | null
  editingName: string
  setEditingName: (v: string) => void
  commitEdit: () => void
  handleEditKeyDown: (e: React.KeyboardEvent) => void
  startEdit: (id: string, name: string) => void
  deleteSection: (id: string) => void
  setActiveSectionFilter: (id: string | null) => void
}) {
  const color = SECTION_COLORS[idx % SECTION_COLORS.length]
  const { isOver, setNodeRef } = useDroppable({ id: `section-drop-${sec.id}` })

  return (
    <div
      ref={setNodeRef}
      className={`sections-panel__item sections-panel__item--user ${isActive ? 'active' : ''} ${isOver ? 'sections-panel__item--drop-over' : ''}`}
    >
      {editingId === sec.id ? (
        <input
          className="sections-panel__edit-input"
          value={editingName}
          onChange={e => setEditingName(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleEditKeyDown}
          autoFocus
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <button
          className="sections-panel__item-btn"
          onClick={() => setActiveSectionFilter(sec.id)}
        >
          <span className="sections-panel__item-dot" style={{ background: color }} />
          <span className="sections-panel__item-name">{sec.name}</span>
          <span className="sections-panel__item-count">{count}</span>
        </button>
      )}
      <div className="sections-panel__item-actions">
        <button
          className="sections-panel__action-btn"
          title="Rename"
          onClick={e => { e.stopPropagation(); startEdit(sec.id, sec.name) }}
        >✎</button>
        <button
          className="sections-panel__action-btn sections-panel__action-btn--danger"
          title="Delete section"
          onClick={e => { e.stopPropagation(); deleteSection(sec.id) }}
        >✕</button>
      </div>
    </div>
  )
}

interface SectionsPanelProps {
  publishStatus?: 'draft' | 'publishing' | 'live'
  publicUrl?: string
  onPublish?: () => void
}

export function SectionsPanel({ publishStatus, publicUrl, onPublish }: SectionsPanelProps = {}) {
  const {
    sections,
    activeSectionFilter,
    setActiveSectionFilter,
    addSection,
    renameSection,
    deleteSection,
    togglePanel,
    openPublishModal,
  } = useSections()
  const { images, folderPath } = useGallery()

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    addSection(name)
    setNewName('')
    // Auto-create a matching subfolder in the source folder
    if (folderPath) {
      const subPath = `${folderPath}/${name}`
      await window.api.createFolder(subPath)
    }
  }

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }

  const commitEdit = () => {
    if (editingId) renameSection(editingId, editingName)
    setEditingId(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingId(null)
  }

  // Count images in each section (only count images still in gallery)
  const galleryIds = new Set(images.map(i => i.id))
  const sectionCounts = sections.map(sec => ({
    id: sec.id,
    count: sec.imageIds.filter(id => galleryIds.has(id)).length
  }))

  return (
    <div className="sections-panel">
      <div className="sections-panel__header">
        <span className="sections-panel__title">Sections</span>
        <button className="sections-panel__close" onClick={togglePanel} title="Close panel">✕</button>
      </div>

      <div className="sections-panel__list">
        {/* All images */}
        <button
          className={`sections-panel__item ${activeSectionFilter === null ? 'active' : ''}`}
          onClick={() => setActiveSectionFilter(null)}
        >
          <span className="sections-panel__item-icon">◻</span>
          <span className="sections-panel__item-name">All Images</span>
          <span className="sections-panel__item-count">{images.length}</span>
        </button>

        {/* User sections — each is a drop target */}
        {sections.map((sec, idx) => {
          const count = sectionCounts.find(c => c.id === sec.id)?.count ?? 0
          return (
            <DroppableSectionItem
              key={sec.id}
              sec={sec}
              idx={idx}
              isActive={activeSectionFilter === sec.id}
              count={count}
              editingId={editingId}
              editingName={editingName}
              setEditingName={setEditingName}
              commitEdit={commitEdit}
              handleEditKeyDown={handleEditKeyDown}
              startEdit={startEdit}
              deleteSection={deleteSection}
              setActiveSectionFilter={setActiveSectionFilter}
            />
          )
        })}
      </div>

      {/* Add section */}
      <div className="sections-panel__add">
        <input
          ref={newInputRef}
          className="sections-panel__add-input"
          placeholder="New section name…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        <button
          className="sections-panel__add-btn"
          onClick={handleAdd}
          disabled={!newName.trim()}
          title="Add section"
        >+</button>
      </div>

      {/* Publish */}
      <div className="sections-panel__footer">
        {publishStatus === 'live' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="sp__live-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Published to cloud
              {publicUrl && (
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: '11px', padding: '2px 8px', marginLeft: 'auto' }}
                  onClick={() => navigator.clipboard.writeText(publicUrl)}
                >
                  Copy Link
                </button>
              )}
            </div>
            <button
              className="btn btn--ghost"
              style={{ fontSize: '11px', padding: '4px 10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'rgba(255,255,255,.5)' }}
              onClick={onPublish}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Edit Gallery Settings
            </button>
          </div>
        ) : publishStatus === 'publishing' ? (
          <div className="sp__live-indicator sp__live-indicator--pub">
            <div className="sp__mini-spinner" />
            Publishing...
          </div>
        ) : (
          <button
            className="btn btn--accent sections-panel__publish-btn"
            onClick={onPublish || openPublishModal}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Upload to Cloud
          </button>
        )}
      </div>
    </div>
  )
}

export const SECTION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
]
