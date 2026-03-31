import React, { useState, useEffect, useRef } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ProjectData, ClientData } from '../App'
import { getProjectsByClient, getLatestProjectForClient } from '../App'

// Stable color from string
function clientColor(name: string): string {
  const colors = ['#6366f1','#ec4899','#8b5cf6','#a855f7','#3b82f6','#d946ef','#818cf8','#f43f5e','#7c3aed','#c084fc']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

interface WorkspaceDashboardProps {
  projects: ProjectData[]
  clients: ClientData[]
  onNewProject: () => void
  onSelectProject: (id: string) => void
  onSelectClient: (id: string) => void
  onDeleteProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
}

export function WorkspaceDashboard({ projects, clients, onNewProject, onSelectProject, onSelectClient, onDeleteProject, onRenameProject }: WorkspaceDashboardProps) {
  const [sysName, setSysName] = useState('')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [shareMenuId, setShareMenuId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyLink = (projectId: string) => {
    navigator.clipboard.writeText(`pixflow://gallery/${projectId}`).then(() => {
      setCopiedId(projectId)
      setShareMenuId(null)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const emailGallery = (p: ProjectData) => {
    const link = `pixflow://gallery/${p.id}`
    const subject = encodeURIComponent(`Gallery: ${p.name}`)
    const body = encodeURIComponent(`Hi,\n\nHere is your gallery "${p.name}":\n${link}\n\nBest regards`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
    setShareMenuId(null)
  }

  useEffect(() => {
    window.api.getSystemUsername().then(name => {
      if (name) setSysName(name.toUpperCase())
    })
  }, [])

  const q = search.trim().toLowerCase()

  // Filter
  const filteredClients = q
    ? clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        getProjectsByClient(c.id, projects).some(p => p.name.toLowerCase().includes(q))
      )
    : clients

  // Recent galleries — all projects sorted by updatedAt desc
  const recentProjects = [...projects]
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.clientName || '').toLowerCase().includes(q))

  const visibleProjects = showAll ? recentProjects : recentProjects.slice(0, 5)

  const hasAnything = clients.length > 0 || projects.length > 0
  const noResults = q && filteredClients.length === 0 && recentProjects.length === 0

  return (
    <div className="wsd">
      <div className="wsd__inner">

        {/* Header */}
        <div className="wsd__header-row">
          <div>
            <h1 className="wsd__title">Welcome back{sysName ? `, ${sysName.charAt(0) + sysName.slice(1).toLowerCase()}` : ''}</h1>
            {hasAnything && (
              <p className="wsd__subtitle">{clients.length} {clients.length === 1 ? 'client' : 'clients'} &middot; {projects.length} {projects.length === 1 ? 'gallery' : 'galleries'}</p>
            )}
          </div>
          <button className="wsd__btn-primary" onClick={onNewProject}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Gallery
          </button>
        </div>

        {/* Search */}
        {hasAnything && (
          <div className="wsd__search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="wsd__search"
              type="text"
              placeholder="Search clients or galleries..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="wsd__search-clear" onClick={() => setSearch('')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Client Stories Row */}
        {(filteredClients.length > 0 || !q) && (
          <div className="wsd__stories">
            {/* + New */}
            <button className="wsd__story wsd__story--new" onClick={onNewProject}>
              <div className="wsd__story-avatar wsd__story-avatar--new">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span className="wsd__story-name">New</span>
            </button>

            {filteredClients.map(c => {
              const bg = clientColor(c.name)
              // Show up to 2 initials from client name
              const words = c.name.trim().split(/\s+/)
              const initials = words.length >= 2
                ? (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
                : c.name.substring(0, 2).toUpperCase()
              return (
                <button key={c.id} className="wsd__story" onClick={() => onSelectClient(c.id)}>
                  <div className="wsd__story-avatar">
                    <div className="wsd__story-letter" style={{ background: bg }}>{initials}</div>
                  </div>
                  <span className="wsd__story-name">{c.name}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Recent Galleries */}
        {visibleProjects.length > 0 ? (
          <>
            <h2 className="wsd__section-title">Recent Galleries</h2>
            <div className="wsd__grid">
              {visibleProjects.map(p => (
                <div key={p.id} className="wsd__card-wrap">
                  <div className="wsd__card" onClick={() => onSelectProject(p.id)}>
                    <div className="wsd__card-cover">
                      {p.images.length > 0 ? (
                        <img src={toLocalURL(p.images[0].path)} alt="" className="wsd__card-img" />
                      ) : (
                        <div className="wsd__card-placeholder">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="wsd__card-info">
                      <span className="wsd__card-name">{p.name}</span>
                      {p.clientName && <span className="wsd__card-client">{p.clientName}</span>}
                      <span className="wsd__card-count">{p.images.length} images</span>
                    </div>
                  </div>
                  <div className="wsd__card-actions">
                    <button
                      className={`wsd__card-action ${copiedId === p.id ? 'wsd__card-action--copied' : ''}`}
                      title="Share gallery"
                      onClick={e => { e.stopPropagation(); setShareMenuId(shareMenuId === p.id ? null : p.id) }}
                    >
                      {copiedId === p.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                      )}
                    </button>
                    <button
                      className="wsd__card-action wsd__card-action--delete"
                      title="Delete gallery"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  {shareMenuId === p.id && (
                    <div className="share-popup" onClick={e => e.stopPropagation()}>
                      <button className="share-popup__item" onClick={() => emailGallery(p)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        Send via Email
                      </button>
                      <button className="share-popup__item" onClick={() => copyLink(p.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        Copy Link
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!showAll && recentProjects.length > 5 && (
              <button className="wsd__view-all" onClick={() => setShowAll(true)}>
                View all galleries
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}
          </>
        ) : !hasAnything ? (
          <div className="wsd__empty">
            <p className="wsd__empty-text">Create your first gallery to get started</p>
          </div>
        ) : noResults ? (
          <div className="wsd__empty">
            <p className="wsd__empty-text">No results for "{search}"</p>
          </div>
        ) : null}

      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="wsd-modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="wsd-confirm" onClick={e => e.stopPropagation()}>
            <p className="wsd-confirm__text">Are you sure you want to delete this project?</p>
            <div className="wsd-confirm__actions">
              <button className="wsd-confirm__cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="wsd-confirm__delete" onClick={() => { onDeleteProject(confirmDeleteId); setConfirmDeleteId(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
