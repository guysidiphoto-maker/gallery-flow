import React, { useState, useRef, useEffect } from 'react'
import type { ProjectData, ClientData } from '../App'
import { getProjectsByClient } from '../App'

interface ImportModalProps {
  currentProject: string | null
  projects: ProjectData[]
  clients: ClientData[]
  prefilledClientId?: string | null
  initialView?: 'menu' | 'create'
  onClose: () => void
  onSetProject: (id: string) => void
  onCreateProject: (name: string, clientName?: string, eventType?: string) => void
  onImportToCurrent: () => void
}

type View = 'menu' | 'create' | 'existing'

function normalize(s: string): string { return s.trim().toLowerCase() }

function clientColor(name: string): string {
  const colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#f97316','#a855f7']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

export function ImportModal({ currentProject, projects, clients, prefilledClientId, initialView = 'menu', onClose, onSetProject, onCreateProject, onImportToCurrent }: ImportModalProps) {
  const [view, setView] = useState<View>(initialView)
  const [newName, setNewName] = useState('')
  const [newEventType, setNewEventType] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const q = normalize(newClientName)
  const suggestions = q
    ? clients.filter(c => normalize(c.name).includes(q))
    : []

  // If exact match exists, auto-select
  const exactMatch = clients.find(c => normalize(c.name) === q)

  const handleImportToCurrent = () => {
    onImportToCurrent()
  }

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    // If we have a selected client or exact match, pass that client's name
    // The parent handler will do normalized matching
    if (selectedClientId) {
      const c = clients.find(cl => cl.id === selectedClientId)
      onCreateProject(name, c?.name || newClientName, newEventType || undefined)
    } else {
      onCreateProject(name, newClientName, newEventType || undefined)
    }
  }

  const handlePickExisting = (id: string) => {
    onSetProject(id)
  }

  const handleClientInput = (val: string) => {
    setNewClientName(val)
    setSelectedClientId(null)
    setShowSuggestions(true)
    setHighlightIdx(-1)
  }

  const handleSelectSuggestion = (c: ClientData) => {
    setNewClientName(c.name)
    setSelectedClientId(c.id)
    setShowSuggestions(false)
    setHighlightIdx(-1)
  }

  const handleClientKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') handleCreate()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        handleSelectSuggestion(suggestions[highlightIdx])
      } else {
        handleCreate()
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && suggestionsRef.current) {
      const el = suggestionsRef.current.children[highlightIdx] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIdx])

  return (
    <div className="im-overlay" onClick={onClose}>
      <div className="im" onClick={e => e.stopPropagation()}>
        <div className="im__header">
          {view !== 'menu' ? (
            <button className="im__back" onClick={() => setView('menu')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          ) : null}
          <h2 className="im__title">
            {view === 'menu' && 'Import images'}
            {view === 'create' && 'New Gallery'}
            {view === 'existing' && 'Choose project'}
          </h2>
          <button className="im__close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Menu view ── */}
        {view === 'menu' && (
          <div className="im__options">
            <button
              className={`im__option ${!currentProject ? 'im__option--disabled' : ''}`}
              onClick={currentProject ? handleImportToCurrent : undefined}
            >
              <div className="im__option-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div className="im__option-text">
                <span className="im__option-label">Add to current project</span>
                <span className="im__option-desc">
                  {currentProject ? `Add images to "${currentProject}"` : 'No project open'}
                </span>
              </div>
            </button>

            <button className="im__option" onClick={() => setView('create')}>
              <div className="im__option-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div className="im__option-text">
                <span className="im__option-label">Create new project</span>
                <span className="im__option-desc">Start a new project and import images</span>
              </div>
            </button>

            <button className="im__option" onClick={() => setView('existing')}>
              <div className="im__option-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="im__option-text">
                <span className="im__option-label">Add to another project</span>
                <span className="im__option-desc">Import images into an existing project</span>
              </div>
            </button>

          </div>
        )}

        {/* ── Create new project view ── */}
        {view === 'create' && (
          <div className="im__create">
            <label className="im__field-label">Gallery name</label>
            <input
              className="im__input"
              type="text"
              placeholder="e.g. Summer Campaign"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            {!prefilledClientId && (
              <>
                <label className="im__field-label" style={{ marginTop: '6px' }}>Client name</label>
                <div className="im__autocomplete">
                  <input
                    className="im__input"
                    type="text"
                    placeholder="e.g. John & Jane"
                    value={newClientName}
                    onChange={e => handleClientInput(e.target.value)}
                    onKeyDown={handleClientKeyDown}
                    onFocus={() => { if (q && suggestions.length > 0) setShowSuggestions(true) }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  />
                  {selectedClientId && (
                    <span className="im__autocomplete-badge">Existing client</span>
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="im__suggestions" ref={suggestionsRef}>
                      {suggestions.map((c, i) => (
                        <button
                          key={c.id}
                          className={`im__suggestion ${i === highlightIdx ? 'im__suggestion--active' : ''}`}
                          onMouseDown={e => { e.preventDefault(); handleSelectSuggestion(c) }}
                          onMouseEnter={() => setHighlightIdx(i)}
                        >
                          <span className="im__suggestion-avatar" style={{ background: clientColor(c.name) }}>{c.name.charAt(0).toUpperCase()}</span>
                          <span className="im__suggestion-name">{c.name}</span>
                          <span className="im__suggestion-meta">{getProjectsByClient(c.id, projects).length} galleries</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!selectedClientId && newClientName.trim() && !exactMatch && (
                  <span className="im__autocomplete-hint">New client will be created</span>
                )}
              </>
            )}
            {/* Event type */}
            <label className="im__field-label" style={{ marginTop: 8 }}>Event type</label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginBottom: 14,
            }}>
              {[
                { value: 'conference', label: 'Conference' },
                { value: 'corporate-event', label: 'Corporate Event' },
                { value: 'government', label: 'Government' },
                { value: 'retreat-abroad', label: 'Retreat Abroad' },
                { value: 'retreat-local', label: 'Local Retreat' },
                { value: 'pre-event', label: 'Pre-Event' },
                { value: 'other', label: 'Other' },
              ].map(opt => {
                const active = newEventType === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setNewEventType(active ? '' : opt.value)}
                    className={`npm__chip ${active ? 'npm__chip--active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 11, borderRadius: 50 }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <button
              className={`im__create-btn ${!newName.trim() ? 'im__create-btn--disabled' : ''}`}
              onClick={handleCreate}
            >
              Create
            </button>
          </div>
        )}

        {/* ── Existing projects view ── */}
        {view === 'existing' && (
          <div className="im__existing">
            {projects.length === 0 && (
              <div className="im__project-empty" style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: '13px' }}>
                No projects yet
              </div>
            )}
            {projects.map(p => (
              <button key={p.id} className="im__project-row" onClick={() => handlePickExisting(p.id)}>
                <div className="im__project-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <span className="im__project-name">{p.name}{p.clientName ? ` — ${p.clientName}` : ''}</span>
                <svg className="im__project-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
