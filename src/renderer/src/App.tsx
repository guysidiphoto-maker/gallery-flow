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
import { ClientGalleryPage } from './components/ClientGalleryPage'
import { PublishPanel } from './components/PublishPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { uploadGalleryToCloud, uploadStoryToCloud, markGalleryLive, updateGallerySettings } from './lib/cloudUpload'
import { getAuthState, signInWithGoogle, type Business, type AuthState } from './lib/auth'
import { WelcomeScreen } from './components/onboarding/WelcomeScreen'
import { AuthShell } from './components/auth/AuthShell'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { supabase } from './lib/supabase'
import type { ImageFile } from './types'

export interface ClientData {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface DeliverySettings {
  accessType: 'public' | 'password'
  password: string | null
  downloadsEnabled: boolean
  bulkDownloadEnabled: boolean
  downloadQuality: 'web' | 'high' | 'original'
  studioName: string
  logoUrl: string | null
  showFooterCredit: boolean
  galleryTitle: string
  clientName: string
  coverImageId: string | null
  layoutMode: '1-col' | '2-col' | '3-col'
  imageSpacing: 'none' | 'small' | 'medium'
  cornerStyle: 'sharp' | 'rounded'
  generateStories: boolean
  showStories: boolean
  faceRecognition: 'locked'
  creditsSystem: 'locked'
  // Legacy compat
  allowDownloads?: boolean
  autoGenerateStories?: boolean
  logoPath?: string | null
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  accessType: 'public',
  password: null,
  downloadsEnabled: true,
  bulkDownloadEnabled: true,
  downloadQuality: 'high',
  studioName: '',
  logoUrl: null,
  showFooterCredit: true,
  galleryTitle: '',
  clientName: '',
  coverImageId: null,
  layoutMode: '2-col',
  imageSpacing: 'small',
  cornerStyle: 'rounded',
  generateStories: true,
  showStories: true,
  faceRecognition: 'locked',
  creditsSystem: 'locked',
}

/** Migrate old settings shape to new */
function migrateSettings(raw: Record<string, unknown>): DeliverySettings {
  const d = { ...DEFAULT_DELIVERY_SETTINGS }
  if (raw.studioName != null) d.studioName = raw.studioName as string
  if (raw.logoPath != null) d.logoUrl = raw.logoPath as string
  if (raw.logoUrl != null) d.logoUrl = raw.logoUrl as string
  if (raw.allowDownloads != null) d.downloadsEnabled = raw.allowDownloads as boolean
  if (raw.autoGenerateStories != null) d.generateStories = raw.autoGenerateStories as boolean
  // Copy all new fields if present
  for (const key of Object.keys(d) as (keyof DeliverySettings)[]) {
    if (key in raw && raw[key] != null) {
      (d as Record<string, unknown>)[key] = raw[key]
    }
  }
  return d
}

export interface GalleryPublishState {
  status: 'draft' | 'publishing' | 'live'
  publicUrl?: string
  galleryDir?: string
  storiesReady: boolean
}

export interface ProjectData {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  imageIds: string[]
  createdAt: string
  updatedAt: string
  deliverySettings?: DeliverySettings
  publishState?: GalleryPublishState
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
  return getProjectsByClient(clientId, projects).reduce((sum, p) => sum + p.imageIds.length, 0)
}

// Resolve imageIds to ImageFile array (filters out missing)
export function resolveImages(imageIds: string[], registry: Record<string, ImageFile>): ImageFile[] {
  return imageIds.map(id => registry[id]).filter(Boolean)
}

// Get cover image path for a project
export function getProjectCover(project: ProjectData, registry: Record<string, ImageFile>): string | null {
  if (project.imageIds.length === 0) return null
  const img = registry[project.imageIds[0]]
  return img?.path || null
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
  // ─── Auth Gate ──────────────────────────────────────────────────────────────
  const [authState, setAuthState] = useState<AuthState | 'loading'>('loading')
  const [authUser, setAuthUser] = useState<Record<string, unknown> | null>(null)
  const [authBusiness, setAuthBusiness] = useState<Business | null>(null)
  const [authSignInLoading, setAuthSignInLoading] = useState(false)
  const [authError, setAuthError] = useState<string | undefined>()

  useEffect(() => {
    getAuthState().then(({ state, user, business }) => {
      setAuthState(state)
      setAuthUser(user || null)
      setAuthBusiness(business || null)
    })

    // Listen for auth state changes (e.g. after OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setAuthState('unauthenticated')
        setAuthUser(null)
        setAuthBusiness(null)
        return
      }
      const { state, user, business } = await getAuthState()
      setAuthState(state)
      setAuthUser(user || null)
      setAuthBusiness(business || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoogleSignIn = async () => {
    setAuthSignInLoading(true)
    setAuthError(undefined)
    const { error } = await signInWithGoogle()
    if (error) {
      setAuthError(error)
      setAuthSignInLoading(false)
    }
    // On success, onAuthStateChange will fire
  }

  const handleOnboardingComplete = (business: Business) => {
    setAuthBusiness(business)
    setAuthState('ready')
  }

  // Render based on auth state
  if (authState === 'loading') {
    return (
      <div style={{ background: '#0a0a0f', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.1)', borderTopColor: 'rgba(255,255,255,.5)', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <AuthShell />
  }

  if (authState === 'needs_onboarding' && authUser) {
    return <OnboardingFlow user={authUser} onComplete={handleOnboardingComplete} />
  }

  return <MainApp business={authBusiness} />
}

// ─── Main App (authenticated + onboarded) ─────────────────────────────────────

function MainApp({ business }: { business: Business | null }) {
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
  const [imageRegistry, setImageRegistry] = useState<Record<string, ImageFile>>({})
  const registryLoaded = useRef(false)
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
  const [galleryPreviewProjectId, setGalleryPreviewProjectId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<string | null>(null)
  const [publishProjectId, setPublishProjectId] = useState<string | null>(null)
  const [publishPhase, setPublishPhase] = useState<'settings' | 'publishing' | 'done' | 'error' | 'editing'>('settings')
  const [publishUpload, setPublishUpload] = useState<{
    uploaded: number; total: number; percent: number; currentFile: string;
    phase?: string;
    result?: { totalImages: number; originalsUploaded: number; webCopiesUploaded: number; thumbsUploaded: number; failedFiles: Array<{ filename: string; reason: string }> }
  }>({ uploaded: 0, total: 0, percent: 0, currentFile: '' })
  const [publishStory, setPublishStory] = useState({ completed: 0, total: 4, currentStyle: '' })
  const [pubError, setPubError] = useState('')
  const [publishGalleryDir, setPublishGalleryDir] = useState('')
  // Register keyboard shortcuts
  useKeyboardShortcuts()

  const currentProject = projects.find(p => p.id === currentProjectId) || null

  const handleExportGallery = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    const imgs = resolveImages(project.imageIds, imageRegistry)
    const destDir = await window.api.chooseExportDir?.()
    if (!destDir) return

    setExportProgress('Exporting gallery...')

    // Get top pick paths
    const topPickIds = useGallery.getState().topPickIds
    const topPickPaths = imgs.filter(i => topPickIds.has(i.id)).map(i => i.path)

    // Export images + HTML
    const result = await window.api.exportGallery(project.name, project.clientName || '', imgs.map(i => i.path), destDir, topPickPaths)

    if (!result.success) {
      setExportProgress(null)
      return
    }

    // Generate stories if we have enough top picks
    if (topPickPaths.length >= 2) {
      const picks = topPickPaths.length > 25 ? topPickPaths.slice(0, 25) : topPickPaths
      const duration = topPickPaths.length <= 25 ? 15 : 20
      const galleryDir = result.galleryDir || `${destDir}/${project.name.replace(/[/\\?%*:|"<>]/g, '-')}`

      const styles = [
        { name: 'minimal', motionMode: 'subtle', transitionStyle: 'clean', colorMatch: 'off' },
        { name: 'bold', motionMode: 'dynamic', transitionStyle: 'cinematic', colorMatch: 'subtle' },
        { name: 'cinematic', motionMode: 'dynamic', transitionStyle: 'cinematic', colorMatch: 'subtle' },
        { name: 'fast', motionMode: 'subtle', transitionStyle: 'energetic', colorMatch: 'off' },
      ]

      for (let i = 0; i < styles.length; i++) {
        const style = styles[i]
        setExportProgress(`Generating stories (${i + 1}/4) \u2014 ${style.name}...`)

        try {
          const buildResult = await window.api.buildStoryScenes(picks, duration, style.motionMode) as {
            error?: string
            scenes: Array<{ type: string; imagePaths: string[]; duration: number; motionType: string }>
            totalDuration: number
          }
          if (buildResult.error) continue

          const outputPath = `${galleryDir}/stories/story_${style.name}.mp4`
          await window.api.renderStory(
            buildResult.scenes.map((s) => ({ type: s.type, imagePaths: s.imagePaths, duration: s.duration, motionType: s.motionType })),
            { totalDuration: buildResult.totalDuration, resolution: '1080x1920', fps: 30, motionMode: style.motionMode, transitionStyle: style.transitionStyle, colorMatch: style.colorMatch === 'subtle' },
            outputPath
          )
        } catch {
          // Skip failed story
        }
      }
    }

    setExportProgress(null)
  }

  const [isCloudPublishing, setIsCloudPublishing] = useState(false)

  const handlePublish = async (projectId: string) => {
    if (isCloudPublishing) { console.log('[handlePublish] blocked — already in progress'); return }
    setIsCloudPublishing(true)
    const project = projects.find(p => p.id === projectId)
    if (!project) { setIsCloudPublishing(false); return }
    const imgs = resolveImages(project.imageIds, imageRegistry)
    const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)

    setPublishPhase('publishing')
    setPubError('')
    setPublishUpload({ uploaded: 0, total: imgs.length, currentFile: '' })
    setPublishStory({ completed: 0, total: 4, currentStyle: '' })

    // Mark as publishing
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, publishState: { status: 'publishing', storiesReady: false } }
      : p
    ))

    try {
      // Step 1: Upload originals + web copies + thumbnails to cloud (individually)
      const topPickIdSet = useGallery.getState().topPickIds
      const cloudGallery = await uploadGalleryToCloud(
        project.name,
        project.clientName,
        project.clientId,
        project.id,
        imgs.map(i => i.path),
        topPickIdSet,
        settings as Record<string, unknown>,
        (progress) => {
          setPublishUpload({
            uploaded: progress.uploaded,
            total: progress.total,
            percent: progress.percent,
            currentFile: progress.currentFile || '',
            phase: progress.phase,
            result: progress.result,
          })
        }
      )

      // Step 2: Generate & upload stories (each uploaded individually)
      let storiesReady = false
      const storyWarnings: string[] = []
      if (settings.generateStories) {
        const topPickPaths = imgs.filter(i => topPickIdSet.has(i.id)).map(i => i.path)

        if (topPickPaths.length >= 2) {
          const picks = topPickPaths.length > 25 ? topPickPaths.slice(0, 25) : topPickPaths
          const duration = topPickPaths.length <= 25 ? 15 : 20
          const tempDir = await window.api.getTempDir()

          const styles = [
            { name: 'minimal', motionMode: 'subtle', transitionStyle: 'clean', colorMatch: 'off' },
            { name: 'bold', motionMode: 'dynamic', transitionStyle: 'cinematic', colorMatch: 'subtle' },
            { name: 'cinematic', motionMode: 'dynamic', transitionStyle: 'cinematic', colorMatch: 'subtle' },
            { name: 'fast', motionMode: 'subtle', transitionStyle: 'energetic', colorMatch: 'off' },
          ]

          let storiesUploaded = 0
          for (let i = 0; i < styles.length; i++) {
            const style = styles[i]
            setPublishStory({ completed: i, total: 4, currentStyle: style.name })

            try {
              const buildResult = await window.api.buildStoryScenes(picks, duration, style.motionMode) as {
                error?: string
                scenes: Array<{ type: string; imagePaths: string[]; duration: number; motionType: string }>
                totalDuration: number
              }
              if (!buildResult.error) {
                const outputPath = `${tempDir}/story_${style.name}.mp4`
                const renderResult = await window.api.renderStory(
                  buildResult.scenes.map((s) => ({ type: s.type, imagePaths: s.imagePaths, duration: s.duration, motionType: s.motionType })),
                  { totalDuration: buildResult.totalDuration, resolution: '1080x1920', fps: 30, motionMode: style.motionMode, transitionStyle: style.transitionStyle, colorMatch: style.colorMatch === 'subtle' },
                  outputPath
                )
                if (renderResult.success) {
                  const uploadResult = await uploadStoryToCloud(cloudGallery.id, style.name, outputPath)
                  if (uploadResult.skipped) {
                    storyWarnings.push(uploadResult.reason || `Story "${style.name}" skipped`)
                  } else {
                    storiesUploaded++
                  }
                }
              }
            } catch { /* skip */ }
          }
          setPublishStory({ completed: 4, total: 4, currentStyle: '' })
          storiesReady = storiesUploaded > 0
        }
      }

      // Step 3: Mark gallery live ONLY after uploads + stories are all done
      await markGalleryLive(cloudGallery.id, cloudGallery.publicUrl)

      // Step 4: Update local state
      setPublishGalleryDir(cloudGallery.publicUrl)
      setPublishPhase('done')
      if (storyWarnings.length > 0) {
        setPubError(storyWarnings.join('; '))
      }
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, publishState: { status: 'live', publicUrl: cloudGallery.publicUrl, storiesReady } }
        : p
      ))
    } catch (err: unknown) {
      console.error('[handlePublish] EXCEPTION:', err)
      setPubError(err instanceof Error ? err.message : 'Unknown error')
      setPublishPhase('error')
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, publishState: { status: 'draft', storiesReady: false } }
        : p
      ))
    } finally {
      setIsCloudPublishing(false)
    }
  }

  const handleUpdateSettings = async (projectId: string) => {
    if (isCloudPublishing) { console.log('[handleUpdateSettings] blocked — already in progress'); return }
    setIsCloudPublishing(true)
    try {
      const project = projects.find(p => p.id === projectId)
      if (!project) { console.log('[handleUpdateSettings] project not found:', projectId); return }

      console.log('[handleUpdateSettings] projectId:', projectId, 'localId:', project.id)
      console.log('[handleUpdateSettings] publishState:', project.publishState)
      console.log('[handleUpdateSettings] raw deliverySettings:', project.deliverySettings)

      const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)
      console.log('[handleUpdateSettings] migrated settings:', settings)

      const { error } = await updateGallerySettings(project.id, settings as Record<string, unknown>)
      if (error) {
        console.error('[handleUpdateSettings] FAILED:', error)
        setPubError(`Failed to update: ${error}`)
        setPublishPhase('error')
      } else {
        console.log('[handleUpdateSettings] SUCCESS')
        setPublishPhase('done')
      }
    } catch (err) {
      console.error('[handleUpdateSettings] EXCEPTION:', err)
      setPubError(err instanceof Error ? err.message : String(err))
      setPublishPhase('error')
    } finally {
      setIsCloudPublishing(false)
    }
  }

  // Sync gallery images back to project imageIds + registry
  useEffect(() => {
    if (!currentProjectId) return
    const galleryImages = useGallery.getState().images
    // Update registry with current images
    setImageRegistry(prev => {
      const updated = { ...prev }
      for (const img of galleryImages) {
        updated[img.id] = img
      }
      return updated
    })
    // Update project's imageIds
    const ids = galleryImages.map(i => i.id)
    setProjects(prev => prev.map(p =>
      p.id === currentProjectId ? { ...p, imageIds: ids } : p
    ))
  }, [images, currentProjectId])

  // Load projects + image registry from prefs on startup
  useEffect(() => {
    ;(async () => {
      const [rawProjects, rawRegistry] = await Promise.all([
        window.api.getPref('projects'),
        window.api.getPref('imageRegistry')
      ])

      let registry: Record<string, ImageFile> = {}
      if (rawRegistry && typeof rawRegistry === 'object' && !Array.isArray(rawRegistry)) {
        registry = rawRegistry as Record<string, ImageFile>
      }

      if (rawProjects && Array.isArray(rawProjects)) {
        const migrated = (rawProjects as any[]).map(p => {
          // Migration: if project has old `images` array, extract to registry
          if (p.images && Array.isArray(p.images) && p.images.length > 0 && !p.imageIds) {
            const ids: string[] = []
            for (const img of p.images) {
              registry[img.id || img.path] = img
              ids.push(img.id || img.path)
            }
            return {
              id: p.id,
              name: p.name,
              clientId: p.clientId ?? null,
              clientName: p.clientName ?? null,
              imageIds: ids,
              createdAt: p.createdAt ?? '',
              updatedAt: p.updatedAt ?? '',
            }
          }
          return {
            ...p,
            imageIds: p.imageIds || [],
            clientId: p.clientId ?? null,
            clientName: p.clientName ?? null,
            createdAt: p.createdAt ?? '',
            updatedAt: p.updatedAt ?? '',
          }
        })
        setProjects(migrated)
        const maxId = migrated.reduce((max: number, p: ProjectData) => Math.max(max, Number(p.id) || 0), 0)
        setNextId(maxId + 1)
      }

      setImageRegistry(registry)
      projectsLoaded.current = true
      registryLoaded.current = true
    })()
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

  // Persist image registry to prefs
  useEffect(() => {
    if (!registryLoaded.current) return
    window.api.setPref('imageRegistry', imageRegistry)
  }, [imageRegistry])

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
        const ids = galleryImages.map(i => i.id)
        const updatedRegistry = { ...imageRegistry }
        for (const img of galleryImages) updatedRegistry[img.id] = img
        const updatedProjects = projects.map(p =>
          p.id === currentProjectId ? { ...p, imageIds: ids } : p
        )
        window.api.setPref('projects', updatedProjects)
        window.api.setPref('imageRegistry', updatedRegistry)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentProjectId, projects, imageRegistry])

  // Switch to a project: load its images into gallery
  const switchToProject = (projectId: string) => {
    console.log('SWITCH_TO_PROJECT', projectId, 'projects count:', projects.length)
    // Save current project first
    if (currentProjectId) {
      const currentImages = useGallery.getState().images
      const ids = currentImages.map(i => i.id)
      setImageRegistry(prev => {
        const updated = { ...prev }
        for (const img of currentImages) updated[img.id] = img
        return updated
      })
      setProjects(prev => prev.map(p =>
        p.id === currentProjectId ? { ...p, imageIds: ids } : p
      ))
    }
    const target = projects.find(p => p.id === projectId)
    console.log('FOUND_TARGET', !!target, target?.name, 'imageIds:', target?.imageIds.length)
    if (target) {
      const resolved = resolveImages(target.imageIds, imageRegistry)
      useGallery.setState({ images: resolved, folderPath: '' })
    }
    setCurrentProjectId(projectId)
    setWelcomed(true)
  }

  // Go back to workspace
  const goWorkspace = () => {
    if (currentProjectId) {
      const currentImages = useGallery.getState().images
      const ids = currentImages.map(i => i.id)
      setImageRegistry(prev => {
        const updated = { ...prev }
        for (const img of currentImages) updated[img.id] = img
        return updated
      })
      setProjects(prev => prev.map(p =>
        p.id === currentProjectId ? { ...p, imageIds: ids } : p
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
          imageRegistry={imageRegistry}
          onNewProject={() => { setImportInitialView('create'); setIsImportOpen(true) }}
          onSelectProject={(id) => switchToProject(id)}
          onSelectClient={(id) => { setSelectedClientId(id); setView('clientDetail') }}
          onDeleteProject={(id) => {
            const project = projects.find(p => p.id === id)
            setProjects(prev => {
              const updated = prev.filter(p => p.id !== id)
              // Clean orphan registry entries
              if (project) {
                const allUsedIds = new Set(updated.flatMap(p => p.imageIds))
                setImageRegistry(prev => {
                  const cleaned = { ...prev }
                  for (const imgId of project.imageIds) {
                    if (!allUsedIds.has(imgId)) delete cleaned[imgId]
                  }
                  return cleaned
                })
              }
              return updated
            })
          }}
          onRenameProject={(id, name) => {
            setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
          }}
        />
      ) : welcomed && !currentProjectId && view === 'clients' ? (
        <ClientsDashboard
          clients={clients}
          projects={projects}
          imageRegistry={imageRegistry}
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
              imageRegistry={imageRegistry}
              onSelectProject={(id) => switchToProject(id)}
              onDeleteProject={(id) => {
                const project = projects.find(p => p.id === id)
                setProjects(prev => {
                  const updated = prev.filter(p => p.id !== id)
                  if (project) {
                    const allUsedIds = new Set(updated.flatMap(p => p.imageIds))
                    setImageRegistry(prev => {
                      const cleaned = { ...prev }
                      for (const imgId of project.imageIds) {
                        if (!allUsedIds.has(imgId)) delete cleaned[imgId]
                      }
                      return cleaned
                    })
                  }
                  return updated
                })
              }}
              onBack={() => setView('workspace')}
              onRenameClient={(id, newName) => {
                setClients(prev => prev.map(c => c.id === id ? { ...c, name: newName, updatedAt: new Date().toISOString() } : c))
                setProjects(prev => prev.map(p => p.clientId === id ? { ...p, clientName: newName } : p))
              }}
              onNewGallery={() => { setPrefilledClientId(client.id); setImportInitialView('create'); setIsImportOpen(true) }}
              onPreviewGallery={(id) => setGalleryPreviewProjectId(id)}
              onPublish={(id) => {
                const proj = projects.find(p => p.id === id)
                setPublishProjectId(id)
                setPublishPhase(proj?.publishState?.status === 'live' ? 'editing' : 'settings')
              }}
            />
          )
        })()
      ) : (
      <>
      <GalleryDndProvider>
        <div className="app__content">
          {/* Sections sidebar */}
          {isSectionsPanelOpen && (
            <SectionsPanel
              publishStatus={currentProject?.publishState?.status || 'draft'}
              publicUrl={currentProject?.publishState?.publicUrl}
              onPublish={() => {
                if (!currentProjectId) return
                const proj = projects.find(p => p.id === currentProjectId)
                setPublishProjectId(currentProjectId)
                setPublishPhase(proj?.publishState?.status === 'live' ? 'editing' : 'settings')
              }}
            />
          )}

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

      {/* Client Gallery Preview */}
      {galleryPreviewProjectId && (() => {
        const project = projects.find(p => p.id === galleryPreviewProjectId)
        if (!project) return null
        const imgs = resolveImages(project.imageIds, imageRegistry)
        return (
          <ClientGalleryPage
            projectName={project.name}
            clientName={project.clientName}
            images={imgs}
            onBack={() => setGalleryPreviewProjectId(null)}
            onExport={() => handleExportGallery(galleryPreviewProjectId)}
            storyPaths={[]}
          />
        )
      })()}

      {/* Publish Panel */}
      {publishProjectId && (() => {
        const project = projects.find(p => p.id === publishProjectId)
        if (!project) return null
        const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)
        return (
          <PublishPanel
            projectName={project.name}
            clientName={project.clientName}
            imageCount={project.imageIds.length}
            topPickCount={useGallery.getState().topPickIds.size}
            settings={settings}
            onSettingsChange={(s) => {
              setProjects(prev => prev.map(p => p.id === publishProjectId ? { ...p, deliverySettings: s } : p))
            }}
            onPublish={() => publishPhase === 'editing' ? handleUpdateSettings(publishProjectId) : handlePublish(publishProjectId)}
            onClose={() => { setPublishProjectId(null); setPublishPhase('settings') }}
            phase={publishPhase}
            uploadProgress={publishUpload}
            storyProgress={publishStory}
            error={pubError}
            galleryDir={publishGalleryDir}
            publicUrl={publishGalleryDir.startsWith('http') ? publishGalleryDir : undefined}
            onOpenGallery={() => { if (publishGalleryDir && !publishGalleryDir.startsWith('http')) window.api.revealInFinder(publishGalleryDir) }}
            onRetry={() => handlePublish(publishProjectId)}
          />
        )
      })()}

      {/* Overlays */}
      {showPreviewMode && <PreviewMode />}
      {showStoryModal && <StoryModal />}
      <ImageViewer />
      <SocialMode />
      <RenamePreviewModal />
      <RandomizeModal />
      {/* Old PublishModal disabled — replaced by PublishPanel */}
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
      {demoActive && <DemoMode onDone={handleDemoDone} />}
      <ToastStack />
      <StatusBar />

      {/* Export progress indicator */}
      {exportProgress && (
        <div className="export-float">
          <div className="export-float__content">
            <div className="cg__story-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span className="export-float__text">{exportProgress}</span>
          </div>
        </div>
      )}

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
            const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, imageIds: [], createdAt: now, updatedAt: now }
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
          const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, imageIds: [], createdAt: now, updatedAt: now }
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
