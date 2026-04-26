import React, { useState, useRef, useCallback } from 'react'
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
  hasUnsavedChanges?: boolean
  lastSyncedAt?: string
  isUpdating?: boolean
}

export function SectionsPanel({ publishStatus, publicUrl, onPublish, hasUnsavedChanges, lastSyncedAt, isUpdating }: SectionsPanelProps = {}) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = useCallback(() => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [publicUrl])
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
  const { images, folderPath, removeUnassignedImages } = useGallery()

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

  // Photos in the gallery but not in any section — usually leftover when a
  // section was deleted and the user wants those photos to leave the gallery.
  const unassignedCount = sections.length > 0
    ? (() => {
        const inAnySection = new Set<string>()
        for (const sec of sections) for (const id of sec.imageIds) inAnySection.add(id)
        return images.filter(img => !inAnySection.has(img.id)).length
      })()
    : 0

  const handleRemoveUnassigned = useCallback(async () => {
    if (unassignedCount === 0) return
    const ok = window.confirm(
      `Remove ${unassignedCount} photo${unassignedCount === 1 ? '' : 's'} that ${unassignedCount === 1 ? 'is' : 'are'} not in any section?\n\nThe source files on disk are not touched.`,
    )
    if (!ok) return
    await removeUnassignedImages()
  }, [unassignedCount, removeUnassignedImages])

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

      {/* Cleanup unassigned photos — visible only when sections exist and there
          are leftover photos not in any section */}
      {unassignedCount > 0 && (
        <button
          onClick={handleRemoveUnassigned}
          style={{
            margin: '4px 8px 8px',
            padding: '8px 10px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 6,
            color: '#f59e0b',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            textAlign: 'left',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14H7L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
          </svg>
          <span style={{ flex: 1 }}>
            Remove {unassignedCount} unassigned photo{unassignedCount === 1 ? '' : 's'}
          </span>
        </button>
      )}

      {/* Publish */}
      <div className="sections-panel__footer">
        {publishStatus === 'live' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hasUnsavedChanges ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span style={{ color: '#f59e0b', fontSize: 11 }}>Unpublished changes</span>
                </div>
                <button
                  className="btn btn--accent"
                  style={{ fontSize: 11, padding: '6px 10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: isUpdating ? 0.7 : 1, cursor: isUpdating ? 'wait' : 'pointer' }}
                  onClick={onPublish}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <span className="cg__story-spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />
                      Syncing…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Update Changes
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* Published state — green check + timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 500 }}>Published</span>
                  {lastSyncedAt && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 400 }}>
                      · {new Date(lastSyncedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{' '}
                      {new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {publicUrl && (
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 11, padding: '6px 10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: copied ? '#10b981' : 'rgba(255,255,255,.55)', transition: 'color .15s' }}
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Link Copied!
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy Link
                      </>
                    )}
                  </button>
                )}
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 11, padding: '4px 10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'rgba(255,255,255,.35)' }}
                  onClick={onPublish}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Edit Settings
                </button>
              </>
            )}
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
