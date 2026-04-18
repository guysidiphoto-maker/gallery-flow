import React, { useState, useRef, useEffect } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ClientData, ProjectData } from '../App'
import type { ImageFile } from '../types'
import { getProjectsByClient, getTotalImagesForClient, getProjectCover } from '../App'
import { fetchCloudClientId, buildClientPageUrl } from '../lib/cloudUpload'

function clientColor(name: string): string {
  const colors = ['#6366f1','#ec4899','#8b5cf6','#a855f7','#3b82f6','#d946ef','#818cf8','#f43f5e','#7c3aed','#c084fc']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  return words.length >= 2
    ? (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
    : name.substring(0, 2).toUpperCase()
}

const EVENT_TYPES = [
  { key: '', label: 'No tag' },
  { key: 'conference', label: '🎤 Conference' },
  { key: 'corporate-event', label: '🏢 Corporate' },
  { key: 'government', label: '🏛️ Government' },
  { key: 'retreat-abroad', label: '✈️ Retreat Abroad' },
  { key: 'retreat-local', label: '🏖️ Local Retreat' },
  { key: 'pre-event', label: '📋 Pre-Event' },
  { key: 'other', label: '📸 Other' },
]

interface ClientDetailProps {
  client: ClientData
  projects: ProjectData[]
  imageRegistry: Record<string, ImageFile>
  onSelectProject: (id: string) => void
  onDeleteProject: (id: string) => void
  onBack: () => void
  onRenameClient: (id: string, name: string) => void
  onNewGallery: () => void
  onPreviewGallery: (projectId: string) => void
  onPublish: (projectId: string) => void
  onPublishAll?: (projectIds: string[]) => void
  onUpdateAll?: (projectIds: string[]) => void
  onUpdateEventType?: (projectId: string, eventType: string) => void
}

export function ClientDetail({ client, projects, imageRegistry, onSelectProject, onDeleteProject, onBack, onRenameClient, onNewGallery, onPreviewGallery, onPublish, onPublishAll, onUpdateAll, onUpdateEventType }: ClientDetailProps) {
  const clientProjects = getProjectsByClient(client.id, projects)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const totalImages = getTotalImagesForClient(client.id, projects)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(client.name)
  const [copied, setCopied] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [shareMenuId, setShareMenuId] = useState<string | null>(null)
  const [copiedGalleryId, setCopiedGalleryId] = useState<string | null>(null)
  const [clientPageStatus, setClientPageStatus] = useState<'idle' | 'loading' | 'copied' | 'empty'>('idle')
  const [sortBy, setSortBy] = useState<'createdAt' | 'eventDate' | 'updatedAt'>('createdAt')

  const showClientPageButton = clientProjects.some(p => p.publishState?.status === 'live')

  const handleShareClientPage = async () => {
    setClientPageStatus('loading')
    try {
      const cloudClientId = await fetchCloudClientId(client.id)
      if (!cloudClientId) {
        setClientPageStatus('empty')
        setTimeout(() => setClientPageStatus('idle'), 2500)
        return
      }
      const url = buildClientPageUrl(cloudClientId)
      await navigator.clipboard.writeText(url)
      setClientPageStatus('copied')
      setTimeout(() => setClientPageStatus('idle'), 2000)
    } catch (err) {
      console.error('[client-page]', err)
      setClientPageStatus('idle')
    }
  }

  const copyGalleryLink = (project: typeof clientProjects[0]) => {
    const url = project.publishState?.publicUrl || `pixflow://gallery/${project.id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGalleryId(project.id)
      setShareMenuId(null)
      setTimeout(() => setCopiedGalleryId(null), 1500)
    })
  }

  const emailGallery = (p: ProjectData) => {
    const link = `pixflow://gallery/${p.id}`
    const subject = encodeURIComponent(`Gallery: ${p.name}`)
    const body = encodeURIComponent(`Hi,\n\nHere is your gallery "${p.name}":\n${link}\n\nBest regards`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
    setShareMenuId(null)
  }
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== client.name) {
      onRenameClient(client.id, trimmed)
    } else {
      setEditName(client.name)
    }
    setEditing(false)
  }

  const handleShare = () => {
    const link = `pixflow://client/${client.id}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* clipboard unavailable */ })
  }

  // Sort key extractor
  const getSortDate = (p: ProjectData): string => {
    if (sortBy === 'eventDate') return p.deliverySettings?.eventDate || p.createdAt || ''
    if (sortBy === 'updatedAt') return p.updatedAt || ''
    return p.createdAt || ''
  }

  const sortedProjects = [...clientProjects].sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))

  // Group projects by year
  const groupedByYear: Record<string, ProjectData[]> = {}
  sortedProjects.forEach(p => {
    const dateStr = getSortDate(p)
    const year = dateStr ? new Date(dateStr).getFullYear().toString() : 'Unknown'
    if (!groupedByYear[year]) groupedByYear[year] = []
    groupedByYear[year].push(p)
  })
  const years = Object.keys(groupedByYear).sort((a, b) => b.localeCompare(a))

  const bg = clientColor(client.name)
  const initials = getInitials(client.name)

  return (
    <div className="cdv">
      <div className="cdv__inner">
        {/* Top bar */}
        <div className="cdv__top-bar">
          <button className="cdv__back" onClick={onBack}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
        </div>

        {/* Header row — same pattern as workspace */}
        <div className="cdv__header-row">
          <div className="cdv__avatar" style={{ background: bg }}>
            <span className="cdv__avatar-initials">{initials}</span>
          </div>
          <div className="cdv__header-info">
            {editing ? (
              <input
                ref={inputRef}
                className="cdv__title-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditName(client.name); setEditing(false) } }}
              />
            ) : (
              <h1 className="cdv__title" onClick={() => { setEditName(client.name); setEditing(true) }} title="Click to rename">
                {client.name}
                <svg className="cdv__title-edit" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </h1>
            )}
            <p className="cdv__subtitle">{clientProjects.length} {clientProjects.length === 1 ? 'gallery' : 'galleries'} &middot; {totalImages} {totalImages === 1 ? 'image' : 'images'}</p>
          </div>
          <div className="cdv__header-actions">
            {showClientPageButton && (
              <button
                className="cdv__btn-secondary"
                onClick={handleShareClientPage}
                disabled={clientPageStatus === 'loading'}
                title="Copy a public link that shows all this client's galleries on one page"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                {clientPageStatus === 'copied' ? 'Link Copied!' :
                 clientPageStatus === 'loading' ? 'Loading...' :
                 clientPageStatus === 'empty' ? 'Publish a gallery first' :
                 'Client Page'}
              </button>
            )}
            <button className="cdv__btn-secondary" onClick={handleShare}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              {copied ? 'Copied!' : 'Share'}
            </button>
            <button className="cdv__btn-secondary" onClick={onNewGallery}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Gallery
            </button>
            {/* Update All Live button */}
            {onUpdateAll && (() => {
              const liveOnes = clientProjects.filter(p => p.publishState?.status === 'live')
              if (liveOnes.length === 0) return null
              return (
                <button
                  onClick={() => onUpdateAll(liveOnes.map(p => p.id))}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)',
                    color: '#34d399', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  Update All ({liveOnes.length})
                </button>
              )
            })()}
            {/* Upload All / Upload New button */}
            {onPublishAll && clientProjects.length > 0 && (() => {
              const unpublished = clientProjects.filter(p => !p.publishState || p.publishState.status === 'draft')
              const allLive = unpublished.length === 0
              if (allLive) return null
              const isAll = unpublished.length === clientProjects.length
              return (
                <button
                  className="cdv__btn-primary"
                  onClick={() => onPublishAll(unpublished.map(p => p.id))}
                  style={{
                    padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: '#6366f1', border: 'none', color: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 12px rgba(99,102,241,.3)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  {isAll ? `Upload All (${unpublished.length})` : `Upload New (${unpublished.length})`}
                </button>
              )
            })()}
          </div>
        </div>

        {/* Sort control */}
        {clientProjects.length > 1 && (
          <div className="cdv__sort-bar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .45 }}>
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/>
            </svg>
            <button
              className={`cdv__sort-btn ${sortBy === 'createdAt' ? 'cdv__sort-btn--active' : ''}`}
              onClick={() => setSortBy('createdAt')}
            >Date Added</button>
            <button
              className={`cdv__sort-btn ${sortBy === 'eventDate' ? 'cdv__sort-btn--active' : ''}`}
              onClick={() => setSortBy('eventDate')}
            >Event Date</button>
            <button
              className={`cdv__sort-btn ${sortBy === 'updatedAt' ? 'cdv__sort-btn--active' : ''}`}
              onClick={() => setSortBy('updatedAt')}
            >Last Modified</button>
          </div>
        )}

        {/* Galleries grouped by year */}
        {clientProjects.length > 0 ? (
          years.map(year => (
            <div key={year} className="cdv__year-group">
              <h3 className="cdv__year-label">{year}</h3>
              <div className="cdv__grid">
                {groupedByYear[year].map(p => (
                  <div key={p.id} className="cdv__card-wrap">
                    <div className="cdv__card" onClick={() => onSelectProject(p.id)}>
                      <div className="cdv__card-cover">
                        {(() => { const cover = getProjectCover(p, imageRegistry); return cover ? (
                          <img src={toLocalURL(cover)} alt="" className="cdv__card-img" />
                        ) : (
                          <div className="cdv__card-placeholder">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                        )})()}
                      </div>
                      <div className="cdv__card-info">
                        <span className="cdv__card-name">{p.name}</span>
                        <div className="cdv__card-meta">
                          <span className="cdv__card-count">{p.imageIds.length} {p.imageIds.length === 1 ? 'image' : 'images'}</span>
                          {p.publishState?.status === 'live' && (
                            <span className="cdv__card-badge cdv__card-badge--live">Live</span>
                          )}
                          {p.publishState?.status === 'publishing' && (
                            <span className="cdv__card-badge cdv__card-badge--pub">Publishing...</span>
                          )}
                        </div>
                        {/* Event type tag */}
                        {onUpdateEventType && (
                          <select
                            value={p.eventType || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); onUpdateEventType(p.id, e.target.value) }}
                            style={{
                              marginTop: 4, padding: '3px 6px', width: '100%', boxSizing: 'border-box',
                              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                              borderRadius: 6, color: p.eventType ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.3)',
                              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                              appearance: 'none', WebkitAppearance: 'none',
                            }}
                          >
                            {EVENT_TYPES.map(et => (
                              <option key={et.key} value={et.key} style={{ background: '#1a1a1c', color: '#fff' }}>
                                {et.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Live actions bar */}
                      {p.publishState?.status === 'live' && (
                        <div className="cdv__card-live-bar">
                          <button
                            className="cdv__card-live-btn"
                            onClick={e => { e.stopPropagation(); if (p.publishState?.galleryDir) window.api.revealInFinder(p.publishState.galleryDir) }}
                          >View</button>
                          <button
                            className="cdv__card-live-btn"
                            onClick={e => { e.stopPropagation(); copyGalleryLink(p) }}
                          >Copy Link</button>
                        </div>
                      )}
                    </div>
                    <div className="wsd__card-actions">
                      {(!p.publishState || p.publishState.status === 'draft') && (
                        <button
                          className="wsd__card-action"
                          title="Publish gallery"
                          onClick={e => { e.stopPropagation(); onPublish(p.id) }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                            <polyline points="16 6 12 2 8 6"/>
                            <line x1="12" y1="2" x2="12" y2="15"/>
                          </svg>
                        </button>
                      )}
                      <button
                        className="wsd__card-action"
                        title="Preview gallery"
                        onClick={e => { e.stopPropagation(); onPreviewGallery(p.id) }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      <button
                        className={`wsd__card-action ${copiedGalleryId === p.id ? 'wsd__card-action--copied' : ''}`}
                        title="Share gallery"
                        onClick={e => { e.stopPropagation(); setShareMenuId(shareMenuId === p.id ? null : p.id) }}
                      >
                        {copiedGalleryId === p.id ? (
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
                        <button className="share-popup__item" onClick={() => copyGalleryLink(p)}>
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
            </div>
          ))
        ) : (
          <div className="cdv__empty">
            <p className="cdv__empty-text">No galleries yet. Create one to get started.</p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="wsd-modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="wsd-confirm" onClick={e => e.stopPropagation()}>
            <p className="wsd-confirm__text">Are you sure you want to delete this gallery?</p>
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
