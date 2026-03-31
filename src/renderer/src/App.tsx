import React, { useEffect, useRef, useState } from 'react'
import { useGallery } from './store/gallery'
import { useSections } from './store/sections'
import { Toolbar } from './components/Toolbar'
import { GalleryGrid } from './components/GalleryGrid'
import { PreviewMode } from './components/PreviewMode'
import { RenamePreviewModal } from './components/RenamePreviewModal'
import { DuplicatesPanel } from './components/DuplicatesPanel'
import { ToastStack } from './components/ToastStack'
import { StoryModal } from './components/StoryModal'
import { ImageViewer } from './components/ImageViewer'
import { SocialMode } from './components/SocialMode'
import { SectionsPanel } from './components/SectionsPanel'
import { PublishModal } from './components/PublishModal'
import { GalleryDndProvider } from './components/GalleryDndProvider'
import { RandomizeModal } from './components/RandomizeModal'
import { WelcomeModal } from './components/WelcomeModal'
import { WelcomeScreen } from './components/WelcomeScreen'
import { WorkspaceDashboard } from './components/WorkspaceDashboard'
import { ClientsDashboard } from './components/ClientsDashboard'
import { ClientDetail } from './components/ClientDetail'
import { ImportModal } from './components/ImportModal'
import { DemoMode } from './components/DemoMode'
import { StatusBar } from './components/StatusBar'
import { TopPicksTray } from './components/TopPicksTray'
import { ExportPanel } from './components/ExportPanel'
import { RenameFab } from './components/RenameFab'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { ImageFile } from './types'

export interface ClientData {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ProjectData {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  images: ImageFile[]
  createdAt: string
  updatedAt: string
}

function normalizeClientName(name: string): string {
  return name.trim().toLowerCase()
}

function clientColor(name: string): string {
  const colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#f97316','#a855f7']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

export function getProjectsByClient(clientId: string, projects: ProjectData[]): ProjectData[] {
  return projects.filter(p => p.clientId === clientId)
}

export function getTotalImagesForClient(clientId: string, projects: ProjectData[]): number {
  return getProjectsByClient(clientId, projects).reduce((sum, p) => sum + p.images.length, 0)
}

export function getLatestProjectForClient(clientId: string, projects: ProjectData[]): ProjectData | null {
  const clientProjects = getProjectsByClient(clientId, projects)
  if (clientProjects.length === 0) return null
  return clientProjects[clientProjects.length - 1]
}

function GallerySkeleton({ thumbnailSize }: { thumbnailSize: number }) {
  return (
    <div className="gallery-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)` }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ width: thumbnailSize, height: thumbnailSize }} />
      ))}
    </div>
  )
}

export default function App() {
  const { showPreviewMode, showDuplicatesPanel, showStoryModal, isLoading, folderPath, reloadFolder, thumbnailSize, images, showTopPicksTray, showExportPanel } = useGallery()
  const { isPanelOpen: isSectionsPanelOpen, isPublishModalOpen, isPublishing, publishDone, publishError, resetForFolder } = useSections()
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [demoActive, setDemoActive] = useState(false)
  const demoTriggered = useRef(false)
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [clients, setClients] = useState<ClientData[]>([])
  const [nextId, setNextId] = useState(1)
  const projectsLoaded = useRef(false)
  const clientsLoaded = useRef(false)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importInitialView, setImportInitialView] = useState<'menu' | 'create'>('menu')
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [view, setView] = useState<'workspace' | 'clients' | 'clientDetail'>('workspace')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [newProjectClientName, setNewProjectClientName] = useState('')
  const [newProjectSelectedClientId, setNewProjectSelectedClientId] = useState<string | null>(null)
  const [newProjectShowSuggestions, setNewProjectShowSuggestions] = useState(false)
  const [newProjectHighlight, setNewProjectHighlight] = useState(-1)
  const [newProjectSaveClient, setNewProjectSaveClient] = useState(false)
  const [prefilledClientId, setPrefilledClientId] = useState<string | null>(null)
  // Register keyboard shortcuts
  useKeyboardShortcuts()

  const currentProject = projects.find(p => p.id === currentProjectId) || null

  // Save current project's images back to projects array when gallery images change
  useEffect(() => {
    if (!currentProjectId) return
    const galleryImages = useGallery.getState().images
    setProjects(prev => prev.map(p =>
      p.id === currentProjectId ? { ...p, images: galleryImages } : p
    ))
  }, [images, currentProjectId])

  // Load projects from prefs on startup (welcome screen stays until user acts)
  useEffect(() => {
    window.api.getPref('projects').then(val => {
      if (val && Array.isArray(val)) {
        // Migrate old projects that may lack clientId/clientName/createdAt/updatedAt
        const migrated = (val as ProjectData[]).map(p => ({
          ...p,
          clientId: p.clientId ?? null,
          clientName: p.clientName ?? null,
          createdAt: p.createdAt ?? '',
          updatedAt: p.updatedAt ?? '',
        }))
        setProjects(migrated)
        const maxId = migrated.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0)
        setNextId(maxId + 1)
      }
      projectsLoaded.current = true
    })
  }, [])

  // Load clients from prefs on startup
  useEffect(() => {
    window.api.getPref('clients').then(val => {
      if (val && Array.isArray(val)) {
        setClients(val as ClientData[])
      }
      clientsLoaded.current = true
    })
  }, [])

  // Persist projects to prefs
  useEffect(() => {
    if (!projectsLoaded.current) return
    window.api.setPref('projects', projects)
  }, [projects])

  // Persist clients to prefs
  useEffect(() => {
    if (!clientsLoaded.current) return
    window.api.setPref('clients', clients)
  }, [clients])

  // Save current project on app close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentProjectId) {
        const galleryImages = useGallery.getState().images
        const updated = projects.map(p =>
          p.id === currentProjectId ? { ...p, images: galleryImages } : p
        )
        window.api.setPref('projects', updated)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentProjectId, projects])

  // Switch to a project: load its images into gallery
  const switchToProject = (projectId: string) => {
    console.log('SWITCH_TO_PROJECT', projectId, 'projects count:', projects.length)
    // Save current project images first
    if (currentProjectId) {
      const currentImages = useGallery.getState().images
      setProjects(prev => prev.map(p =>
        p.id === currentProjectId ? { ...p, images: currentImages } : p
      ))
    }
    const target = projects.find(p => p.id === projectId)
    console.log('FOUND_TARGET', !!target, target?.name, 'images:', target?.images.length)
    if (target) {
      useGallery.setState({ images: target.images, folderPath: '' })
    }
    setCurrentProjectId(projectId)
    setWelcomed(true)
  }

  // Go back to workspace
  const goWorkspace = () => {
    if (currentProjectId) {
      const currentImages = useGallery.getState().images
      setProjects(prev => prev.map(p =>
        p.id === currentProjectId ? { ...p, images: currentImages } : p
      ))
    }
    setCurrentProjectId(null)
    setView('workspace')
    useGallery.setState({ images: [], folderPath: '' })
  }

  // Restore last folder on launch + show welcome on first run
  useEffect(() => {
    window.api.getPref('thumbnailSize').then(size => {
      if (typeof size === 'number') {
        useGallery.setState({ thumbnailSize: size })
      }
    })
    window.api.getPref('welcomeShown').then(shown => {
      if (!shown) setShowWelcome(true)
    })
  }, [])

  const handleCloseWelcome = () => {
    setShowWelcome(false)
    window.api.setPref('welcomeShown', true)
  }

  // Trigger demo on first-ever launch (welcome screen dismissed + no demo seen yet)
  useEffect(() => {
    if (welcomed && !demoTriggered.current && !localStorage.getItem('pickflow_demo_seen')) {
      demoTriggered.current = true
      setTimeout(() => setDemoActive(true), 400)
    }
  }, [welcomed])

  const handleDemoDone = () => {
    setDemoActive(false)
    localStorage.setItem('pickflow_demo_seen', '1')
  }

  // Reset sections when folder changes
  useEffect(() => {
    resetForFolder()
  }, [folderPath])

  return (
    <div className="app">
      {!welcomed && (
        <WelcomeScreen
          onDismiss={() => setWelcomed(true)}
          onNewProject={() => {
            console.log('OPEN_NEW_PROJECT_MODAL')
            setIsImportOpen(false)
            setIsNewProjectModalOpen(true)
          }}
          onOpenExisting={() => {
            console.log('OPEN_EXISTING_PROJECT_MODAL')
            setIsNewProjectModalOpen(false)
            setWelcomed(true)
          }}
        />
      )}
      <Toolbar
        currentProject={currentProject?.name || null}
        projects={projects}
        onImport={() => { setImportInitialView('menu'); setIsImportOpen(true) }}
        onImportCreate={() => { setImportInitialView('create'); setIsImportOpen(true) }}
        onGoWorkspace={goWorkspace}
        onGoClients={() => { goWorkspace(); setView('clients') }}
        onSwitchProject={(id) => switchToProject(id)}
      />

      {/* Workspace or Gallery */}
      {welcomed && !currentProjectId && view === 'workspace' ? (
        <WorkspaceDashboard
          projects={projects}
          clients={clients}
          onNewProject={() => { setImportInitialView('create'); setIsImportOpen(true) }}
          onSelectProject={(id) => switchToProject(id)}
          onSelectClient={(id) => { setSelectedClientId(id); setView('clientDetail') }}
          onDeleteProject={(id) => {
            setProjects(prev => prev.filter(p => p.id !== id))
          }}
          onRenameProject={(id, name) => {
            setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
          }}
        />
      ) : welcomed && !currentProjectId && view === 'clients' ? (
        <ClientsDashboard
          clients={clients}
          projects={projects}
          onSelectClient={(id) => { setSelectedClientId(id); setView('clientDetail') }}
          onBack={() => setView('workspace')}
        />
      ) : welcomed && !currentProjectId && view === 'clientDetail' ? (
        (() => {
          const client = clients.find(c => c.id === selectedClientId)
          if (!client) return null
          return (
            <ClientDetail
              client={client}
              projects={projects}
              onSelectProject={(id) => switchToProject(id)}
              onDeleteProject={(id) => setProjects(prev => prev.filter(p => p.id !== id))}
              onBack={() => setView('workspace')}
              onRenameClient={(id, newName) => {
                setClients(prev => prev.map(c => c.id === id ? { ...c, name: newName, updatedAt: new Date().toISOString() } : c))
                setProjects(prev => prev.map(p => p.clientId === id ? { ...p, clientName: newName } : p))
              }}
              onNewGallery={() => { setPrefilledClientId(client.id); setImportInitialView('create'); setIsImportOpen(true) }}
            />
          )
        })()
      ) : (
      <>
      <GalleryDndProvider>
        <div className="app__content">
          {/* Sections sidebar */}
          {isSectionsPanelOpen && <SectionsPanel />}

          {/* Main gallery or empty state */}
          <div className={`app__main ${isSectionsPanelOpen ? 'app__main--sections-open' : ''} ${showDuplicatesPanel ? 'app__main--sidebar-open' : ''}`}>
            <div className="gallery-scroll">
              {isLoading ? <GallerySkeleton thumbnailSize={thumbnailSize} /> : <GalleryGrid />}
            </div>
          </div>

          {/* Duplicates sidebar */}
          {showDuplicatesPanel && <DuplicatesPanel />}
        </div>
      </GalleryDndProvider>

      {/* Top Picks Tray */}
      {showTopPicksTray && <TopPicksTray />}

      {/* Export Panel */}
      {showExportPanel && <ExportPanel />}

      {/* Rename FAB */}
      <RenameFab />
      </>
      )}

      {/* Overlays */}
      {showPreviewMode && <PreviewMode />}
      {showStoryModal && <StoryModal />}
      <ImageViewer />
      <SocialMode />
      <RenamePreviewModal />
      <RandomizeModal />
      {(isPublishModalOpen || isPublishing || publishDone || !!publishError) && <PublishModal />}
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
      {demoActive && <DemoMode onDone={handleDemoDone} />}
      <ToastStack />
      <StatusBar />

      {/* Import Modal */}
      {isImportOpen && (
        <ImportModal
          currentProject={currentProject?.name || null}
          projects={projects}
          clients={clients}
          prefilledClientId={prefilledClientId}
          initialView={importInitialView}
          onClose={() => { setIsImportOpen(false); setPrefilledClientId(null) }}
          onSetProject={async (id) => {
            setIsImportOpen(false)
            switchToProject(id)
            const path = await window.api.openFolderDialog()
            if (!path) return
            const raw = await window.api.scanFolder(path)
            if (raw.length === 0) return
            const newImages = raw.map(r => ({ id: r.path, ...r }))
            const existingImages = useGallery.getState().images
            const existingIds = new Set(existingImages.map(i => i.id))
            const toAdd = newImages.filter(i => !existingIds.has(i.id))
            if (toAdd.length === 0) return
            useGallery.setState({ images: [...existingImages, ...toAdd] })
            const folderName = path.split('/').pop() || 'Import'
            const { addSection } = useSections.getState()
            addSection(folderName)
            const newSection = useSections.getState().sections[useSections.getState().sections.length - 1]
            useSections.getState().addImagesToSection(toAdd.map(i => i.id), newSection.id)
            if (!useSections.getState().isPanelOpen) useSections.getState().togglePanel()
          }}
          onCreateProject={async (name, clientName) => {
            setIsImportOpen(false)
            const now = new Date().toISOString()
            let clientId: string | null = null
            let resolvedClientName: string | null = null
            // If prefilled client, use it directly
            if (prefilledClientId) {
              const prefilled = clients.find(c => c.id === prefilledClientId)
              if (prefilled) {
                clientId = prefilled.id
                resolvedClientName = prefilled.name
              }
              setPrefilledClientId(null)
            } else if (clientName && clientName.trim()) {
              const normalized = normalizeClientName(clientName)
              const existing = clients.find(c => normalizeClientName(c.name) === normalized)
              if (existing) {
                clientId = existing.id
                resolvedClientName = existing.name
              } else {
                const newClientId = `client_${Date.now()}`
                const newClient: ClientData = { id: newClientId, name: clientName.trim(), createdAt: now, updatedAt: now }
                setClients(prev => [...prev, newClient])
                clientId = newClientId
                resolvedClientName = clientName.trim()
              }
            }
            const id = String(nextId)
            setNextId(n => n + 1)
            const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, images: [], createdAt: now, updatedAt: now }
            setProjects(prev => [...prev, newProject])
            setCurrentProjectId(id)
            useGallery.setState({ images: [], folderPath: '' })
            const path = await window.api.openFolderDialog()
            if (path) {
              useGallery.setState({ folderPath: path })
              await reloadFolder()
            } else {
              setCurrentProjectId(null)
            }
          }}
          onImportToCurrent={async () => {
            setIsImportOpen(false)
            const path = await window.api.openFolderDialog()
            if (!path) return
            const raw = await window.api.scanFolder(path)
            if (raw.length === 0) return
            const newImages = raw.map(r => ({ id: r.path, ...r }))
            const existingImages = useGallery.getState().images
            const existingIds = new Set(existingImages.map(i => i.id))
            const toAdd = newImages.filter(i => !existingIds.has(i.id))
            if (toAdd.length === 0) return
            useGallery.setState({ images: [...existingImages, ...toAdd] })
            const folderName = path.split('/').pop() || 'Import'
            const { addSection, sections } = useSections.getState()
            addSection(folderName)
            const newSection = useSections.getState().sections[useSections.getState().sections.length - 1]
            useSections.getState().addImagesToSection(toAdd.map(i => i.id), newSection.id)
            if (!useSections.getState().isPanelOpen) useSections.getState().togglePanel()
          }}
        />
      )}

      {/* Welcome: New Project modal */}
      {isNewProjectModalOpen && (() => {
        const cq = newProjectClientName.trim().toLowerCase()
        const cSuggestions = cq ? clients.filter(c => c.name.toLowerCase().includes(cq)) : []
        const cExactMatch = clients.find(c => c.name.toLowerCase() === cq)

        const doCreate = async () => {
          const input = document.getElementById('welcome-new-project-input') as HTMLInputElement
          const name = input?.value.trim()
          if (!name) return
          const now = new Date().toISOString()
          let clientId: string | null = null
          let resolvedClientName: string | null = null

          if (newProjectSelectedClientId) {
            // Existing client selected from autocomplete
            const sel = clients.find(c => c.id === newProjectSelectedClientId)
            if (sel) { clientId = sel.id; resolvedClientName = sel.name }
          } else if (newProjectClientName.trim()) {
            const normalized = normalizeClientName(newProjectClientName)
            const existing = clients.find(c => normalizeClientName(c.name) === normalized)
            if (existing) {
              clientId = existing.id; resolvedClientName = existing.name
            } else if (newProjectSaveClient) {
              // New client — save to clients list
              const newClientId = `client_${Date.now()}`
              const newClient: ClientData = { id: newClientId, name: newProjectClientName.trim(), createdAt: now, updatedAt: now }
              setClients(prev => [...prev, newClient])
              clientId = newClientId; resolvedClientName = newProjectClientName.trim()
            } else {
              // One-time — store name for display only, no client record
              resolvedClientName = newProjectClientName.trim()
            }
          }

          setIsNewProjectModalOpen(false)
          setNewProjectClientName(''); setNewProjectSelectedClientId(null); setNewProjectShowSuggestions(false); setNewProjectSaveClient(false)
          const id = String(nextId); setNextId(n => n + 1)
          const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, images: [], createdAt: now, updatedAt: now }
          setProjects(prev => [...prev, newProject])
          setCurrentProjectId(id); setWelcomed(true)
          useGallery.setState({ images: [], folderPath: '' })
          const path = await window.api.openFolderDialog()
          if (path) { useGallery.setState({ folderPath: path }); await reloadFolder() }
        }

        const selectSuggestion = (c: ClientData) => {
          setNewProjectClientName(c.name); setNewProjectSelectedClientId(c.id)
          setNewProjectShowSuggestions(false); setNewProjectHighlight(-1)
        }

        const handleClientKeyDown = (e: React.KeyboardEvent) => {
          if (!newProjectShowSuggestions || cSuggestions.length === 0) {
            if (e.key === 'Enter') doCreate(); return
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setNewProjectHighlight(i => Math.min(i + 1, cSuggestions.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setNewProjectHighlight(i => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter') {
            e.preventDefault()
            if (newProjectHighlight >= 0 && newProjectHighlight < cSuggestions.length) selectSuggestion(cSuggestions[newProjectHighlight])
            else doCreate()
          }
          else if (e.key === 'Escape') setNewProjectShowSuggestions(false)
        }

        const isNewClient = !newProjectSelectedClientId && newProjectClientName.trim() && !cExactMatch
        const closeModal = () => { setIsNewProjectModalOpen(false); setNewProjectClientName(''); setNewProjectSelectedClientId(null); setNewProjectShowSuggestions(false); setNewProjectSaveClient(false) }

        return (
        <div className="npm-overlay" style={{ zIndex: 10000 }} onClick={closeModal}>
          <div className="npm" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="npm__header">
              <div className="npm__header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div>
                <h2 className="npm__title">New Gallery</h2>
                <p className="npm__subtitle">Create a new gallery for a client</p>
              </div>
              <button className="npm__close" onClick={closeModal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="npm__body">
              {/* Client field */}
              <label className="npm__label">Client</label>
              <div className="im__autocomplete">
                <input
                  className="npm__input"
                  type="text"
                  placeholder="Search or type a client name..."
                  value={newProjectClientName}
                  autoFocus
                  onChange={e => { setNewProjectClientName(e.target.value); setNewProjectSelectedClientId(null); setNewProjectShowSuggestions(true); setNewProjectHighlight(-1); setNewProjectSaveClient(false) }}
                  onKeyDown={handleClientKeyDown}
                  onFocus={() => { if (cq && cSuggestions.length > 0) setNewProjectShowSuggestions(true) }}
                  onBlur={() => setTimeout(() => setNewProjectShowSuggestions(false), 150)}
                />
                {newProjectSelectedClientId && (
                  <span className="im__autocomplete-badge">Existing</span>
                )}
                {newProjectShowSuggestions && cSuggestions.length > 0 && (
                  <div className="im__suggestions">
                    {cSuggestions.map((c, i) => {
                      const count = getProjectsByClient(c.id, projects).length
                      return (
                        <button
                          key={c.id}
                          className={`im__suggestion ${i === newProjectHighlight ? 'im__suggestion--active' : ''}`}
                          onMouseDown={e => { e.preventDefault(); selectSuggestion(c) }}
                          onMouseEnter={() => setNewProjectHighlight(i)}
                        >
                          <span className="im__suggestion-avatar" style={{ background: clientColor(c.name) }}>{c.name.charAt(0).toUpperCase()}</span>
                          <span className="im__suggestion-name">{c.name}</span>
                          <span className="im__suggestion-meta">{count} {count === 1 ? 'gallery' : 'galleries'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Client type chips — only for new clients */}
              {isNewClient && (
                <div className="npm__client-type">
                  <button
                    className={`npm__chip ${!newProjectSaveClient ? 'npm__chip--active' : ''}`}
                    onClick={() => setNewProjectSaveClient(false)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    One-time project
                  </button>
                  <button
                    className={`npm__chip ${newProjectSaveClient ? 'npm__chip--active' : ''}`}
                    onClick={() => setNewProjectSaveClient(true)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                    </svg>
                    Save as client
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="npm__divider"/>

              {/* Gallery name */}
              <label className="npm__label">Gallery name</label>
              <input
                className="npm__input"
                type="text"
                placeholder="e.g. Summer Campaign 2026"
                onKeyDown={e => { if (e.key === 'Enter') doCreate() }}
                id="welcome-new-project-input"
              />

              {/* Create */}
              <button className="npm__create" onClick={doCreate}>
                Create Gallery
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        )
      })()}

    </div>
  )
}
