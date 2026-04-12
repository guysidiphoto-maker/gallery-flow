import React, { useState } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ClientData, ProjectData } from '../App'
import type { ImageFile } from '../types'
import { getProjectsByClient, getTotalImagesForClient, getLatestProjectForClient, getProjectCover } from '../App'

interface ClientsDashboardProps {
  clients: ClientData[]
  projects: ProjectData[]
  imageRegistry: Record<string, ImageFile>
  onSelectClient: (id: string) => void
  onDeleteClient: (id: string) => void
  onBack: () => void
}

export function ClientsDashboard({ clients, projects, imageRegistry, onSelectClient, onDeleteClient, onBack }: ClientsDashboardProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const clientToDelete = confirmDeleteId ? clients.find(c => c.id === confirmDeleteId) : null
  const clientToDeleteProjects = clientToDelete ? getProjectsByClient(clientToDelete.id, projects) : []
  const livePublishedCount = clientToDeleteProjects.filter(p => p.publishState?.status === 'live').length

  return (
    <div className="cd">
      <div className="cd__inner">
        <div className="cd__top-bar">
          <button className="cd__back" onClick={onBack}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Workspace
          </button>
        </div>

        <h1 className="cd__title">CLIENTS</h1>

        {clients.length > 0 ? (
          <div className="cd__grid">
            {clients.map(c => {
              const clientProjects = getProjectsByClient(c.id, projects)
              const totalImages = getTotalImagesForClient(c.id, projects)
              const latestProject = getLatestProjectForClient(c.id, projects)
              const coverPath = latestProject ? getProjectCover(latestProject, imageRegistry) : null

              return (
                <div key={c.id} className="cd__card-wrap" style={{ position: 'relative' }}>
                  <div className="cd__card" onClick={() => onSelectClient(c.id)}>
                    <div className="cd__card-cover">
                      {coverPath ? (
                        <img src={toLocalURL(coverPath)} alt="" className="cd__card-img" />
                      ) : (
                        <div className="cd__card-placeholder">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="cd__card-info">
                      <span className="cd__card-name">{c.name}</span>
                      <span className="cd__card-count">{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}</span>
                      <span className="cd__card-count">{totalImages} image{totalImages !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <button
                    className="cd__card-delete"
                    title="Delete client"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,.85)'
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,1)'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(10,10,15,.92)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)'
                      e.currentTarget.style.color = 'rgba(255,255,255,.95)'
                    }}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,.2)',
                      background: 'rgba(10,10,15,.92)',
                      backdropFilter: 'blur(8px)',
                      color: 'rgba(255,255,255,.95)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      zIndex: 5,
                      boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                      transition: 'background .15s, border-color .15s, color .15s',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="cd__empty">
            <p className="cd__empty-text">No clients yet. Create a project with a client name to get started.</p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {clientToDelete && (
        <div className="wsd-modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="wsd-confirm" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <p className="wsd-confirm__text" style={{ marginBottom: 8 }}>
              Delete client "{clientToDelete.name}"?
            </p>
            <p style={{
              fontSize: 12,
              lineHeight: 1.55,
              color: 'rgba(255,255,255,.55)',
              margin: '0 0 16px',
            }}>
              {clientToDeleteProjects.length > 0 ? (
                <>
                  This will also delete {clientToDeleteProjects.length} {clientToDeleteProjects.length === 1 ? 'gallery' : 'galleries'} for this client
                  {livePublishedCount > 0 && <> ({livePublishedCount} published online will be removed from the cloud)</>}.
                  This cannot be undone.
                </>
              ) : (
                <>The client has no galleries. This cannot be undone.</>
              )}
            </p>
            <div className="wsd-confirm__actions">
              <button className="wsd-confirm__cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className="wsd-confirm__delete"
                onClick={() => { onDeleteClient(clientToDelete.id); setConfirmDeleteId(null) }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
