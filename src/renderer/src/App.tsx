import React, { useEffect, useRef, useState, Component, type ReactNode, type ErrorInfo } from 'react'
import { useGallery } from './store/gallery'
import { useSections } from './store/sections'
import { useVendors } from './store/vendors'
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
import { VendorsPanel } from './components/VendorsPanel'
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
import { toLocalURL } from './utils/imageUtils'
import { UploadFloater } from './components/UploadFloater'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { publishGallery, uploadStoryToCloud, markGalleryLive, updateGallerySettings, updateGalleryImages, updateGallerySectionsInCloud, cancelUpload, deleteGalleryFromCloud, deleteImageFromCloud } from './lib/cloudUpload'
import { supabase } from './lib/supabase'
import { loadPersistedQueue, clearPersistedQueue } from './lib/uploadQueue'
import { usePublish } from './store/publish'
import { type Business } from './lib/auth'
import { AuthShell } from './components/auth/AuthShell'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { useSession } from './store/session'
import { BusinessSettingsModal, DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from './components/BusinessSettingsModal'
import { MissingFilesBanner } from './components/MissingFilesBanner'
import { UpgradeModal } from './components/UpgradeModal'
import type { ImageFile, Section } from './types'

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
  studioWebsite: string
  logoUrl: string | null
  showFooterCredit: boolean
  galleryTitle: string
  clientName: string
  coverImageId: string | null
  coverImageUrl: string | null
  coverCrop: { zoom: number; x: number; y: number } | null
  galleryDescription: string
  eventDate: string
  eventLocation: string
  eventType: string
  clientSelectionEnabled: boolean
  clientCode: string
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
  studioWebsite: '',
  logoUrl: null,
  showFooterCredit: true,
  galleryTitle: '',
  clientName: '',
  coverImageId: null,
  coverImageUrl: null,
  coverCrop: null,
  galleryDescription: '',
  eventDate: '',
  eventLocation: '',
  eventType: '',
  clientSelectionEnabled: false,
  clientCode: '',
  layoutMode: '2-col',
  imageSpacing: 'small',
  cornerStyle: 'rounded',
  generateStories: true,
  showStories: true,
  faceRecognition: 'locked',
  creditsSystem: 'locked',
}

/** Migrate old settings shape to new */
// Fields that persist across galleries (branding, preferences)
const PERSISTENT_SETTINGS: (keyof DeliverySettings)[] = [
  'studioName', 'studioWebsite', 'logoUrl', 'showFooterCredit',
  'downloadsEnabled', 'bulkDownloadEnabled', 'downloadQuality',
  'layoutMode', 'imageSpacing', 'cornerStyle',
  'generateStories', 'showStories',
  'accessType',
  'clientSelectionEnabled',
]

// Fields that reset per gallery (event-specific)
const PER_GALLERY_SETTINGS: (keyof DeliverySettings)[] = [
  'galleryTitle', 'clientName', 'eventDate', 'eventLocation',
  'coverImageId', 'coverImageUrl', 'coverCrop',
  'galleryDescription', 'password', 'clientCode',
]

let lastUsedSettings: Partial<DeliverySettings> | null = null
let currentBusinessSettings: BusinessSettings | null = null

function migrateSettings(raw: Record<string, unknown>, projectEventType?: string): DeliverySettings {
  const d = { ...DEFAULT_DELIVERY_SETTINGS }

  // Apply business settings as base defaults (branding)
  if (currentBusinessSettings) {
    d.studioName = currentBusinessSettings.studioName || d.studioName
    d.studioWebsite = currentBusinessSettings.studioWebsite || d.studioWebsite
    d.logoUrl = currentBusinessSettings.logoUrl ?? d.logoUrl
    d.showFooterCredit = currentBusinessSettings.showFooterCredit
    d.downloadsEnabled = currentBusinessSettings.downloadsEnabled
    d.bulkDownloadEnabled = currentBusinessSettings.bulkDownloadEnabled
    d.downloadQuality = currentBusinessSettings.downloadQuality
    d.layoutMode = currentBusinessSettings.layoutMode
    d.imageSpacing = currentBusinessSettings.imageSpacing
    d.cornerStyle = currentBusinessSettings.cornerStyle
  }

  // If no existing settings, inherit persistent fields from last used
  const hasExisting = Object.keys(raw).length > 3 // more than just defaults
  if (!hasExisting && lastUsedSettings) {
    for (const key of PERSISTENT_SETTINGS) {
      if (key in lastUsedSettings && lastUsedSettings[key] != null) {
        (d as Record<string, unknown>)[key] = lastUsedSettings[key]
      }
    }
  }

  // Legacy migrations
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

  // Inherit eventType from project if not set in settings
  if (!d.eventType && projectEventType) {
    d.eventType = projectEventType
  }

  return d
}

function saveLastUsedSettings(settings: DeliverySettings) {
  lastUsedSettings = {}
  for (const key of PERSISTENT_SETTINGS) {
    (lastUsedSettings as Record<string, unknown>)[key] = settings[key]
  }
  // Also persist to prefs for next app launch
  window.api.setPref('lastDeliverySettings', lastUsedSettings)
}

export interface GalleryPublishState {
  status: 'draft' | 'publishing' | 'live'
  publicUrl?: string
  galleryDir?: string
  galleryDbId?: string
  storiesReady: boolean
  originalsReady: boolean
  publishStatus?: string
  /** Snapshot of image IDs at publish time — used to detect changes */
  publishedImageIds?: string[]
}

export interface ProjectData {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  imageIds: string[]
  /** Per-project Top Picks. Persisted with the project so they survive
   *  app restarts and project switches. */
  topPickIds?: string[]
  /** Per-project sections (gallery groupings). Persisted with the project
   *  for the same reason as topPickIds. */
  sections?: Section[]
  /** Per-project vendors + image-vendor tags */
  vendors?: Array<{ id: string; name: string; category: string; email: string; instagram: string; accessCode: string }>
  vendorTags?: Array<{ imageId: string; vendorId: string }>
  /** Event type for filtering on client page */
  eventType?: string
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

// ─── Error Boundary (prevents full app crash) ──────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.6)', fontFamily: 'inherit' }}>
          <h2 style={{ fontSize: 18, color: '#fff', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, marginBottom: 16, color: 'rgba(255,255,255,.4)' }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} style={{
            padding: '8px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)',
            background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit'
          }}>Try Again</button>
        </div>
      )
    }
    return this.props.children
  }
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

function AppInner() {
  // ─── Auth Gate (driven by the session store) ───────────────────────────────
  const status = useSession(s => s.status)
  const user = useSession(s => s.user)
  const business = useSession(s => s.business)
  const errorMessage = useSession(s => s.errorMessage)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    useSession.getState().init().then(c => { cleanup = c })
    // Listen for sign-out from the Mac app menu (Pixflow → Sign Out)
    const removeSignOutListener = window.api.onSignOut?.(() => {
      useSession.getState().signOut()
    })
    return () => { cleanup?.(); removeSignOutListener?.() }
  }, [])

  const handleOnboardingComplete = async (_business: Business) => {
    // OnboardingFlow already calls createBusiness, which refreshes the session
    // store. We re-trigger here as a safety net so MainApp renders even if the
    // refresh inside lib/auth.ts failed for any reason.
    await useSession.getState().refreshBusiness()
  }

  if (status === 'loading') {
    return (
      <div style={{ background: '#0a0a0f', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.1)', borderTopColor: 'rgba(255,255,255,.5)', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
        <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 12, fontFamily: '-apple-system,sans-serif' }}>Checking session…</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{ background: '#0a0a0f', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40, fontFamily: '-apple-system,sans-serif' }}>
        <p style={{ color: '#f87171', fontSize: 14, maxWidth: 520, textAlign: 'center', lineHeight: 1.5 }}>
          Auth check failed: {errorMessage ?? 'unknown error'}
        </p>
        <button
          onClick={() => useSession.getState().signOut()}
          style={{ padding: '10px 22px', background: '#6366f1', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Continue to sign in
        </button>
      </div>
    )
  }
  if (status === 'unauthenticated') {
    return <AuthShell />
  }
  if (status === 'needs_onboarding' && user) {
    return <OnboardingFlow user={user} onComplete={handleOnboardingComplete} />
  }

  return <MainApp business={business} />
}

// ─── Main App (authenticated + onboarded) ─────────────────────────────────────

function MainApp({ business }: { business: Business | null }) {
  const { showPreviewMode, showDuplicatesPanel, showStoryModal, isLoading, folderPath, reloadFolder, thumbnailSize, images, showTopPicksTray, showExportPanel, topPickIds: galleryTopPickIds } = useGallery()
  const { isPanelOpen: isSectionsPanelOpen, isPublishModalOpen, isPublishing, publishDone, publishError, resetForFolder, sectionsDirtyAt } = useSections()
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [demoActive, setDemoActive] = useState(false)
  const demoTriggered = useRef(false)
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [clients, setClients] = useState<ClientData[]>([])
  const [nextId, setNextId] = useState(1)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [clientsLoaded, setClientsLoaded] = useState(false)
  // Track what was on disk at load time — prevents saving empty over non-empty
  const loadedProjectCount = useRef(-1)
  const loadedRegistryCount = useRef(-1)
  const [imageRegistry, setImageRegistry] = useState<Record<string, ImageFile>>({})
  const [registryLoaded, setRegistryLoaded] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importInitialView, setImportInitialView] = useState<'menu' | 'create'>('menu')
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [view, setView] = useState<'workspace' | 'clients' | 'clientDetail'>('workspace')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [navOrigin, setNavOrigin] = useState<{ type: 'workspace' } | { type: 'clientDetail', clientId: string }>({ type: 'workspace' })
  const [newProjectClientName, setNewProjectClientName] = useState('')
  const [newProjectSelectedClientId, setNewProjectSelectedClientId] = useState<string | null>(null)
  const [newProjectShowSuggestions, setNewProjectShowSuggestions] = useState(false)
  const [newProjectHighlight, setNewProjectHighlight] = useState(-1)
  const [newProjectSaveClient, setNewProjectSaveClient] = useState(false)
  const [newProjectEventType, setNewProjectEventType] = useState('')
  const [prefilledClientId, setPrefilledClientId] = useState<string | null>(null)
  const [galleryPreviewProjectId, setGalleryPreviewProjectId] = useState<string | null>(null)
  // Refs to always access latest state (avoids stale closure bugs in save functions)
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const imageRegistryRef = useRef(imageRegistry)
  imageRegistryRef.current = imageRegistry
  const [exportProgress, setExportProgress] = useState<string | null>(null)
  // Review mode: sequential gallery review (pick tops → next → pick tops → next)
  const [reviewQueue, setReviewQueue] = useState<string[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  // Bulk publish: queue of gallery IDs to publish with same settings
  const [bulkPublishQueue, setBulkPublishQueue] = useState<string[]>([])
  const [bulkPublishProgress, setBulkPublishProgress] = useState(0)
  const [publishProjectId, setPublishProjectId] = useState<string | null>(null)
  const [publishPhase, setPublishPhase] = useState<'settings' | 'publishing' | 'done' | 'error' | 'editing'>('settings')
  const [publishStory, setPublishStory] = useState({ completed: 0, total: 3, currentStyle: '' })
  const [pubError, setPubError] = useState('')
  const [publishGalleryDir, setPublishGalleryDir] = useState('')
  const [isPublishHidden, setIsPublishHidden] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [upgradeInfo, setUpgradeInfo] = useState<{ planName: string; violations: string[] } | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS)
  // Register keyboard shortcuts
  useKeyboardShortcuts({ onShowShortcuts: () => setShowShortcuts(s => !s) })

  const currentProject = projects.find(p => p.id === currentProjectId) || null

  const handleExportGallery = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    const imgs = resolveImages(project.imageIds, imageRegistry)
    const destDir = await window.api.chooseExportDir?.()
    if (!destDir) return

    setExportProgress('Exporting gallery...')

    try {
      // Get top pick paths
      const topPickIds = useGallery.getState().topPickIds
      const topPickPaths = imgs.filter(i => topPickIds.has(i.id)).map(i => i.path)

      // Export images + HTML
      const result = await window.api.exportGallery(project.name, project.clientName || '', imgs.map(i => i.path), destDir, topPickPaths)

      if (!result.success) {
        setExportProgress(null)
        useGallery.getState().addToast(`Export failed: ${result.error || 'Unknown error'}`, 'error')
        return
      }

      // Generate stories if we have enough top picks
      if (topPickPaths.length >= 2) {
        const picks = topPickPaths.length > 25 ? topPickPaths.slice(0, 25) : topPickPaths
        const duration = topPickPaths.length <= 25 ? 15 : 20
        const galleryDir = result.galleryDir || `${destDir}/${project.name.replace(/[/\\?%*:|"<>]/g, '-')}`

        const styles = [
          { name: 'clean', motionMode: 'subtle', transitionStyle: 'clean', colorMatch: 'off' },
          { name: 'fast-social', motionMode: 'dynamic', transitionStyle: 'energetic', colorMatch: 'off' },
          { name: 'vintage', motionMode: 'subtle', transitionStyle: 'soft-fade', colorMatch: 'subtle' },
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[handleExportGallery] EXCEPTION:', err)
      useGallery.getState().addToast(`Export failed: ${msg}`, 'error')
    } finally {
      setExportProgress(null)
    }
  }

  const [isCloudPublishing, setIsCloudPublishing] = useState(false)

  /**
   * "Update Changes" handler — lightweight resync for an already-live gallery.
   * Reuses the existing updateGalleryImages flow for image add/remove/order
   * and the new updateGallerySectionsInCloud for section structure. Does NOT
   * re-upload thumbnails/previews/originals.
   */
  const handleUpdateChanges = async (projectId: string) => {
    if (isCloudPublishing) { return }
    setIsCloudPublishing(true)
    const project = projects.find(p => p.id === projectId)
    if (!project || !project.publishState?.galleryDbId) {
      setIsCloudPublishing(false)
      useGallery.getState().addToast('Gallery is not published — use Publish first', 'error')
      return
    }

    setPublishPhase('publishing')
    setPubError('')

    try {
      const imgs = resolveImages(project.imageIds, imageRegistry)

      // 1) Sync image set + sort order with the cloud
      const imgResult = await updateGalleryImages(
        project.publishState.galleryDbId,
        imgs.map(i => i.path),
        project.publishState.publishedImageIds || imgs.map(i => i.id),
        imageRegistry as Record<string, { filename: string; path: string }>,
      )
      if (imgResult.error) throw new Error(imgResult.error)

      // 2) Sync sections — wipes and recreates gallery_sections + reassigns
      //    section_id on each image by filename.
      const sectionsState = useSections.getState()
      const idToPath = new Map(imgs.map(i => [i.id, i.path]))
      const sectionsInput = sectionsState.sections
        .map((sec, idx) => ({
          localId: sec.id,
          name: sec.name,
          sortOrder: idx,
          imagePaths: sec.imageIds
            .map(id => idToPath.get(id))
            .filter((p): p is string => !!p),
        }))
      const secResult = await updateGallerySectionsInCloud(project.publishState.galleryDbId, sectionsInput)
      if (secResult.error) throw new Error(secResult.error)

      // 3+4) Sync top picks + delivery settings in parallel (both independent)
      const topPickIdSet = useGallery.getState().topPickIds
      const topPickFilenames = new Set(
        imgs.filter(i => topPickIdSet.has(i.id)).map(i => i.filename)
      )
      const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)
      if (project.eventType) {
        (settings as Record<string, unknown>).eventType = project.eventType
      }

      await Promise.all([
        // Top picks
        supabase.from('images')
          .select('id, filename')
          .eq('gallery_id', project.publishState.galleryDbId)
          .then(({ data: cloudImages }) => {
            if (!cloudImages) return
            return Promise.all(cloudImages.map(img =>
              supabase.from('images')
                .update({ is_top_pick: topPickFilenames.has(img.filename) })
                .eq('id', img.id)
            ))
          }),
        // Delivery settings
        updateGallerySettings(project.id, settings as Record<string, unknown>),
      ])

      // 4) Update local snapshot of published image ids so the next diff is empty
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, publishState: { ...p.publishState!, publishedImageIds: imgs.map(i => i.id) } }
        : p
      ))
      sectionsState.markSectionsClean()

      setPublishPhase('done')
      useGallery.getState().addToast('Changes synced to cloud', 'success')
    } catch (err) {
      console.error('[handleUpdateChanges] failed', err)
      setPubError(err instanceof Error ? err.message : String(err))
      setPublishPhase('error')
    } finally {
      setIsCloudPublishing(false)
    }
  }

  const handlePublish = async (projectId: string) => {
    if (isCloudPublishing) { return }
    setIsCloudPublishing(true)
    const project = projects.find(p => p.id === projectId)
    if (!project) { setIsCloudPublishing(false); return }
    const imgs = resolveImages(project.imageIds, imageRegistry)
    const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)

    setPublishPhase('publishing')
    setPubError('')
    setIsPublishHidden(false)
    setPublishStory({ completed: 0, total: 3, currentStyle: '' })

    // Mark as publishing
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, publishState: { status: 'publishing', storiesReady: false, originalsReady: false } }
      : p
    ))

    try {
      // Phases 1-3: Compress → upload previews → upload originals (all via queue engine)
      // Convert top pick IMAGE IDs to FILE PATHS for the upload function
      const topPickIdSet = useGallery.getState().topPickIds
      const topPickPaths = new Set(
        imgs.filter(i => topPickIdSet.has(i.id)).map(i => i.path)
      )

      // Snapshot the current sections so the publish flow can attach
      // section_id to each image and create gallery_sections rows.
      const sectionsState = useSections.getState()
      const idToPath = new Map(imgs.map(i => [i.id, i.path]))
      const sectionsInput = sectionsState.sections
        .map((sec, idx) => ({
          localId: sec.id,
          name: sec.name,
          sortOrder: idx,
          imagePaths: sec.imageIds
            .map(id => idToPath.get(id))
            .filter((p): p is string => !!p),
        }))

      const { galleryId, publicUrl } = await publishGallery(
        project.name,
        project.clientName,
        project.clientId,
        project.id,
        imgs.map(i => i.path),
        topPickPaths,
        settings as Record<string, unknown>,
        sectionsInput,
      )

      // Sections are now in sync with the cloud — clear the dirty marker.
      sectionsState.markSectionsClean()

      // Mark gallery live immediately (images are uploaded)
      await markGalleryLive(galleryId, publicUrl)

      // Show done state NOW — don't wait for stories
      const pubStore = usePublish.getState()
      const originalsReady = pubStore.publishStatus === 'fully_live'
      setPublishGalleryDir(publicUrl)
      setPublishPhase('done')
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, publishState: { status: 'live', publicUrl, galleryDbId: galleryId, storiesReady: false, originalsReady, publishStatus: pubStore.publishStatus, publishedImageIds: imgs.map(i => i.id) } }
        : p
      ))

      // Generate stories in BACKGROUND (don't block the done screen)
      if (settings.generateStories) {
        const topPickPaths = imgs.filter(i => topPickIdSet.has(i.id)).map(i => i.path)
        if (topPickPaths.length >= 2) {
          ;(async () => {
            try {
              const picks = topPickPaths.length > 25 ? topPickPaths.slice(0, 25) : topPickPaths
              const duration = topPickPaths.length <= 25 ? 15 : 20
              const tempDir = await window.api.getTempDir()
              const styles = [
                { name: 'clean', motionMode: 'subtle', transitionStyle: 'clean', colorMatch: 'off' },
                { name: 'fast-social', motionMode: 'dynamic', transitionStyle: 'energetic', colorMatch: 'off' },
                { name: 'vintage', motionMode: 'subtle', transitionStyle: 'soft-fade', colorMatch: 'subtle' },
              ]
              for (const style of styles) {
                try {
                  const buildResult = await window.api.buildStoryScenes(picks, duration, style.motionMode) as {
                    error?: string; scenes: Array<{ type: string; imagePaths: string[]; duration: number; motionType: string }>; totalDuration: number
                  }
                  if (!buildResult.error) {
                    const outputPath = `${tempDir}/story_${style.name}.mp4`
                    const renderResult = await window.api.renderStory(
                      buildResult.scenes.map(s => ({ type: s.type, imagePaths: s.imagePaths, duration: s.duration, motionType: s.motionType })),
                      { totalDuration: buildResult.totalDuration, resolution: '1080x1920', fps: 30, motionMode: style.motionMode, transitionStyle: style.transitionStyle, colorMatch: style.colorMatch === 'subtle', brandedOutro: !!settings.logoUrl, logoPath: settings.logoUrl || null },
                      outputPath
                    )
                    if (renderResult.success) await uploadStoryToCloud(galleryId, style.name, outputPath)
                  }
                } catch { /* skip story */ }
              }
              setProjects(prev => prev.map(p => p.id === projectId
                ? { ...p, publishState: { ...p.publishState!, storiesReady: true } }
                : p
              ))
            } catch { /* stories failed silently */ }
          })()
        }
      }

    } catch (err: unknown) {
      console.error('[handlePublish] EXCEPTION:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'

      if (msg.startsWith('PLAN_LIMIT')) {
        const lines = msg.split('\n')
        const planName = lines[1] || 'Starter'
        const violations = lines.slice(2)
        setUpgradeInfo({ planName, violations })
        setPublishPhase('settings')
      } else {
        setPubError(msg)
        setPublishPhase('error')
      }

      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, publishState: { status: 'draft', storiesReady: false, originalsReady: false } }
        : p
      ))
    } finally {
      setIsCloudPublishing(false)
    }
  }

  const handleUpdateSettings = async (projectId: string) => {
    if (isCloudPublishing) { return }
    setIsCloudPublishing(true)
    try {
      const project = projects.find(p => p.id === projectId)
      if (!project) { return }

      const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>)

      const { error } = await updateGallerySettings(project.id, settings as Record<string, unknown>)
      if (error) {
        console.error('[handleUpdateSettings] FAILED:', error)
        setPubError(`Failed to update: ${error}`)
        setPublishPhase('error')
      } else {
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

  // ── Bulk publish: auto-publish next gallery when current one completes ──
  useEffect(() => {
    if (bulkPublishQueue.length === 0) return
    if (publishPhase !== 'done') return

    const currentBulkIdx = bulkPublishQueue.indexOf(publishProjectId || '')
    if (currentBulkIdx === -1) return

    const nextIdx = currentBulkIdx + 1
    setBulkPublishProgress(nextIdx)

    if (nextIdx >= bulkPublishQueue.length) {
      // All done!
      useGallery.getState().addToast(`All ${bulkPublishQueue.length} galleries published!`, 'success')
      setBulkPublishQueue([])
      setBulkPublishProgress(0)
      setPublishProjectId(null)
      setPublishPhase('settings')
      return
    }

    // Auto-publish next gallery with SAME settings.
    // Get the settings from the first published gallery.
    const firstProject = projects.find(p => p.id === bulkPublishQueue[0])
    const sharedSettings = firstProject?.deliverySettings

    // Apply shared settings to next project (keep name + eventType)
    const nextProjectId = bulkPublishQueue[nextIdx]
    const nextProject = projects.find(p => p.id === nextProjectId)
    if (nextProject && sharedSettings) {
      setProjects(prev => prev.map(p => {
        if (p.id !== nextProjectId) return p
        return {
          ...p,
          deliverySettings: {
            ...sharedSettings,
            galleryTitle: p.name,           // keep gallery name
            eventType: p.eventType || sharedSettings.eventType,  // keep tag
          }
        }
      }))
    }

    // Small delay then publish
    useGallery.getState().addToast(`Publishing ${nextIdx + 1}/${bulkPublishQueue.length}: ${nextProject?.name || ''}`, 'info')
    setTimeout(() => {
      setPublishProjectId(nextProjectId)
      setPublishPhase('settings')
      // Auto-trigger publish (skip settings UI for subsequent galleries)
      handlePublish(nextProjectId)
    }, 1500)
  }, [publishPhase, bulkPublishQueue])

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
          // Fix stuck 'publishing' status from crashed/interrupted sessions
          let publishState = p.publishState?.status === 'publishing'
            ? { ...p.publishState, status: 'draft' }
            : p.publishState
          // Auto-populate publishedImageIds for galleries published before this feature
          if (publishState?.status === 'live' && !publishState.publishedImageIds) {
            publishState = { ...publishState, publishedImageIds: [...(p.imageIds || [])] }
          }
          return {
            ...p,
            imageIds: p.imageIds || [],
            clientId: p.clientId ?? null,
            clientName: p.clientName ?? null,
            createdAt: p.createdAt ?? '',
            updatedAt: p.updatedAt ?? '',
            publishState,
          }
        })
        setProjects(migrated)
        const maxId = migrated.reduce((max: number, p: ProjectData) => Math.max(max, Number(p.id) || 0), 0)
        setNextId(maxId + 1)
      }

      setImageRegistry(registry)
      loadedProjectCount.current = rawProjects && Array.isArray(rawProjects) ? rawProjects.length : 0
      loadedRegistryCount.current = Object.keys(registry).length
      setProjectsLoaded(true)
      setRegistryLoaded(true)
    })()
  }, [])

  // ─── Missing-files detection (Lightroom-style "Locate Folder") ───────────
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set())
  const [missingDismissed, setMissingDismissed] = useState(false)

  // Re-check existence whenever the registry changes (load, relink, import).
  useEffect(() => {
    if (!registryLoaded) return
    const all = Object.values(imageRegistry).map(img => img.path).filter(Boolean) as string[]
    if (all.length === 0) {
      setMissingPaths(new Set())
      return
    }
    const api = window.api as unknown as { checkPathsExist?: (paths: string[]) => Promise<string[]> }
    if (!api.checkPathsExist) return
    api.checkPathsExist(all).then(missing => {
      setMissingPaths(new Set(missing))
      if (missing.length > 0) setMissingDismissed(false)
    }).catch(err => console.warn('[relink] check-paths-exist failed', err))
  }, [imageRegistry])

  const handleRelinkFolder = async () => {
    const api = window.api as unknown as {
      openFolderDialog?: () => Promise<string | null>
      findFilesByName?: (folder: string, names: string[]) => Promise<Record<string, string>>
    }
    if (!api.openFolderDialog || !api.findFilesByName) {
      return { relinked: 0, stillMissing: missingPaths.size, cancelled: true }
    }
    const folder = await api.openFolderDialog()
    if (!folder) return { relinked: 0, stillMissing: missingPaths.size, cancelled: true }

    // Build the set of basenames we're looking for.
    const wantedBasenames = new Set<string>()
    const idsByBasename: Record<string, string[]> = {}
    for (const [id, img] of Object.entries(imageRegistry)) {
      if (!img.path || !missingPaths.has(img.path)) continue
      const base = img.path.split(/[\\/]/).pop() || img.path
      wantedBasenames.add(base)
      ;(idsByBasename[base] = idsByBasename[base] || []).push(id)
    }

    if (wantedBasenames.size === 0) {
      return { relinked: 0, stillMissing: 0 }
    }

    const found = await api.findFilesByName(folder, Array.from(wantedBasenames))

    // Apply the new paths to the registry.
    let relinked = 0
    const updatedRegistry: Record<string, ImageFile> = { ...imageRegistry }
    for (const [base, newPath] of Object.entries(found)) {
      const ids = idsByBasename[base] || []
      for (const id of ids) {
        const old = updatedRegistry[id]
        if (!old) continue
        updatedRegistry[id] = { ...old, path: newPath }
        relinked++
      }
    }
    setImageRegistry(updatedRegistry)

    // Recompute the still-missing set immediately so the banner can update
    // without waiting for the next existence check.
    const stillMissing = new Set<string>()
    for (const img of Object.values(updatedRegistry)) {
      if (img.path && missingPaths.has(img.path)) stillMissing.add(img.path)
    }
    setMissingPaths(stillMissing)

    return { relinked, stillMissing: stillMissing.size }
  }

  // Load clients + last delivery settings from prefs on startup
  useEffect(() => {
    window.api.getPref('clients').then(val => {
      if (val && Array.isArray(val)) {
        setClients(val as ClientData[])
      }
      setClientsLoaded(true)
    })
    window.api.getPref('lastDeliverySettings').then(val => {
      if (val && typeof val === 'object') {
        lastUsedSettings = val as Partial<DeliverySettings>
      }
    })
    window.api.getPref('businessSettings').then(val => {
      if (val && typeof val === 'object') {
        const loaded = { ...DEFAULT_BUSINESS_SETTINGS, ...(val as Partial<BusinessSettings>) }
        setBusinessSettings(loaded)
        currentBusinessSettings = loaded
      }
    })
  }, [])

  // Check for interrupted publish queue on startup (recovery)
  useEffect(() => {
    loadPersistedQueue().then(state => {
      if (state && state.items.some(i => i.status === 'pending' || i.status === 'in_progress')) {
        usePublish.getState().setRecovery(state)

      } else if (state) {
        // Stale completed queue — clear it
        clearPersistedQueue()
      }
    })
  }, [])

  // Persist projects to prefs — guards against saving empty over non-empty.
  useEffect(() => {
    if (!projectsLoaded) return
    // Safety: never overwrite non-empty disk data with empty state
    if (projects.length === 0 && loadedProjectCount.current > 0) {
      console.warn('[persist] BLOCKED saving 0 projects (disk had', loadedProjectCount.current, ')')
      return
    }
    window.api.setPref('projects', projects)
  }, [projects, projectsLoaded])

  // Persist image registry to prefs — guards against saving empty over non-empty.
  useEffect(() => {
    if (!registryLoaded) return
    const count = Object.keys(imageRegistry).length
    if (count === 0 && loadedRegistryCount.current > 0) {
      console.warn('[persist] BLOCKED saving empty registry (disk had', loadedRegistryCount.current, 'images)')
      return
    }
    window.api.setPref('imageRegistry', imageRegistry)
  }, [imageRegistry, registryLoaded])

  // Persist clients to prefs
  useEffect(() => {
    if (!clientsLoaded) return
    window.api.setPref('clients', clients)
  }, [clients, clientsLoaded])

  // Auto-save safety net: snapshot current project every 3 seconds
  // so top picks and sections never get lost on unexpected navigation.
  useEffect(() => {
    if (!currentProjectId) return
    const interval = setInterval(() => {
      const currentImages = useGallery.getState().images
      // Safety: never overwrite a project's imageIds with empty if it already has images
      // (protects against race where gallery store hasn't been hydrated yet)
      if (currentImages.length === 0) {
        const proj = projectsRef.current.find(p => p.id === currentProjectId)
        if (proj && proj.imageIds.length > 0) return
      }
      const snap = snapshotCurrentProject(currentProjectId)
      setImageRegistry(prev => {
        const updated = { ...prev }
        for (const img of currentImages) updated[img.id] = img
        return updated
      })
      setProjects(prev => prev.map(p =>
        p.id === currentProjectId ? { ...p, ...snap, updatedAt: new Date().toISOString() } : p
      ))
    }, 3000)
    return () => clearInterval(interval)
  }, [currentProjectId])

  // Live-mirror top picks + sections from their zustand stores into the
  // current project so they persist on every change (not just on switch /
  // close). Without this, an unexpected crash loses any picks/sections the
  // user made during the session.
  useEffect(() => {
    if (!currentProjectId) return
    const unsubGallery = useGallery.subscribe(state => {
      if (isHydratingProject.current) return
      const ids = Array.from(state.topPickIds)
      setProjects(prev => prev.map(p => {
        if (p.id !== currentProjectId) return p
        // Skip if unchanged to avoid unnecessary re-renders / disk writes
        const cur = p.topPickIds ?? []
        if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return p
        return { ...p, topPickIds: ids }
      }))
    })
    const unsubSections = useSections.subscribe(state => {
      if (isHydratingProject.current) return
      const secs = state.sections
      setProjects(prev => prev.map(p => {
        if (p.id !== currentProjectId) return p
        // Cheap structural check — section count + each id+imageIds length
        const cur = p.sections ?? []
        const same = cur.length === secs.length && cur.every((c, i) =>
          c.id === secs[i].id && c.imageIds.length === secs[i].imageIds.length
        )
        if (same) return p
        return { ...p, sections: secs }
      }))
    })
    const unsubVendors = useVendors.subscribe(state => {
      if (isHydratingProject.current) return
      setProjects(prev => prev.map(p => {
        if (p.id !== currentProjectId) return p
        return { ...p, vendors: state.vendors, vendorTags: state.tags }
      }))
    })
    return () => { unsubGallery(); unsubSections(); unsubVendors() }
  }, [currentProjectId])

  // Save current project on app close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentProjectId) {
        const snapshot = snapshotCurrentProject(currentProjectId)
        const galleryImages = useGallery.getState().images
        const updatedRegistry = { ...imageRegistry }
        for (const img of galleryImages) updatedRegistry[img.id] = img
        const updatedProjects = projects.map(p =>
          p.id === currentProjectId ? { ...p, ...snapshot } : p
        )
        window.api.setPref('projects', updatedProjects)
        window.api.setPref('imageRegistry', updatedRegistry)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentProjectId, projects, imageRegistry])

  // While we're loading a project's state INTO the stores we don't want the
  // live-mirror subscription to fire and write the new project's data back
  // onto the OLD currentProjectId (which still points to the outgoing one
  // until React re-renders). This ref is checked by the subscription.
  const isHydratingProject = useRef(false)

  // Snapshot the per-project state from the live stores. Used when switching
  // projects or closing the app — top picks and sections live in their own
  // zustand stores at runtime but must be persisted on the project itself so
  // they survive a restart.
  const snapshotCurrentProject = (_id: string): Partial<ProjectData> => {
    const galleryState = useGallery.getState()
    const sectionsState = useSections.getState()
    const currentImages = galleryState.images
    const ids = currentImages.map(i => i.id)
    return {
      imageIds: ids,
      topPickIds: Array.from(galleryState.topPickIds),
      sections: sectionsState.sections,
    }
  }

  // Hydrate the live stores from a project's persisted state. Called when
  // switching INTO a project, so the user sees their previous picks/sections.
  const hydrateProjectIntoStores = (target: ProjectData) => {
    isHydratingProject.current = true
    try {
      // Use ref for latest registry (avoids stale closure after batched setImageRegistry)
      const resolved = resolveImages(target.imageIds, imageRegistryRef.current)
      useGallery.setState({
        images: resolved,
        folderPath: '',
        topPickIds: new Set(target.topPickIds ?? []),
        selectedIds: new Set(),
      })
      useSections.setState({
        sections: target.sections ?? [],
        activeSectionFilter: null,
        sectionsDirtyAt: 0,
      })
      useVendors.setState({
        vendors: target.vendors ?? [],
        tags: target.vendorTags ?? [],
        activeVendorFilter: null,
        editingVendorId: null,
      })
    } finally {
      isHydratingProject.current = false
    }
  }

  // Switch to a project: load its images into gallery
  const switchToProject = (projectId: string) => {
    // Save current project first — use refs for latest state
    if (currentProjectId) {
      forceSaveCurrentProject()
    }
    const target = projectsRef.current.find(p => p.id === projectId)
    if (target) {
      hydrateProjectIntoStores(target)
    }
    setCurrentProjectId(projectId)
    setWelcomed(true)
  }

  // ── Review mode: sequential gallery walk-through ─────────────────────

  const forceSaveCurrentProject = () => {
    if (!currentProjectId) return
    const currentImages = useGallery.getState().images
    // Safety: never overwrite a project's imageIds with empty if it already has images
    if (currentImages.length === 0) {
      const proj = projectsRef.current.find(p => p.id === currentProjectId)
      if (proj && proj.imageIds.length > 0) return
    }
    const snapshot = snapshotCurrentProject(currentProjectId)
    // Use refs to get LATEST state (not stale closure)
    const newRegistry = { ...imageRegistryRef.current }
    for (const img of currentImages) newRegistry[img.id] = img
    setImageRegistry(newRegistry)
    imageRegistryRef.current = newRegistry
    const updatedProjects = projectsRef.current.map(p =>
      p.id === currentProjectId ? { ...p, ...snapshot, updatedAt: new Date().toISOString() } : p
    )
    setProjects(updatedProjects)
    projectsRef.current = updatedProjects
    window.api.setPref('projects', updatedProjects)
    window.api.setPref('imageRegistry', newRegistry)
    return updatedProjects
  }

  const startReviewMode = (projectIds: string[]) => {
    if (projectIds.length === 0) return
    setReviewQueue(projectIds)
    setReviewIndex(0)
    // Load first gallery
    const target = projects.find(p => p.id === projectIds[0])
    if (target) {
      if (currentProjectId) forceSaveCurrentProject()
      hydrateProjectIntoStores(target)
      setCurrentProjectId(projectIds[0])
      setWelcomed(true)
    }
  }

  const reviewNext = () => {
    if (reviewQueue.length === 0) return
    forceSaveCurrentProject()
    const nextIdx = reviewIndex + 1
    if (nextIdx >= reviewQueue.length) {
      // Done — save and open publish for the first gallery.
      // Settings configured once will apply to all galleries.
      forceSaveCurrentProject()
      setReviewQueue([])
      setReviewIndex(0)
      setCurrentProjectId(null)
      isHydratingProject.current = true
      try {
        useGallery.setState({ images: [], folderPath: '', topPickIds: new Set() })
        useSections.setState({ sections: [], activeSectionFilter: null })
      } finally {
        isHydratingProject.current = false
      }
      // Open publish settings for first reviewed gallery
      setPublishProjectId(reviewQueue[0])
      setPublishPhase('settings')
      useGallery.getState().addToast(`Review complete! Configure settings — they'll apply to all ${reviewQueue.length} galleries`, 'info')
      return
    }
    setReviewIndex(nextIdx)
    const latestProjects = forceSaveCurrentProject() || projects
    const target = latestProjects.find(p => p.id === reviewQueue[nextIdx])
    if (target) {
      hydrateProjectIntoStores(target)
      setCurrentProjectId(reviewQueue[nextIdx])
    }
  }

  const reviewPrev = () => {
    if (reviewIndex <= 0) return
    forceSaveCurrentProject()
    const prevIdx = reviewIndex - 1
    setReviewIndex(prevIdx)
    const latestProjects = forceSaveCurrentProject() || projects
    const target = latestProjects.find(p => p.id === reviewQueue[prevIdx])
    if (target) {
      hydrateProjectIntoStores(target)
      setCurrentProjectId(reviewQueue[prevIdx])
    }
  }

  const exitReviewMode = () => {
    forceSaveCurrentProject()
    setReviewQueue([])
    setReviewIndex(0)
    setCurrentProjectId(null)
    setView('workspace')
    isHydratingProject.current = true
    try {
      useGallery.setState({ images: [], folderPath: '', topPickIds: new Set() })
      useSections.setState({ sections: [], activeSectionFilter: null })
    } finally {
      isHydratingProject.current = false
    }
  }

  const isReviewMode = reviewQueue.length > 0

  // Delete a client and cascade-delete all its galleries (local + cloud)
  const deleteClientCascade = (clientId: string) => {
    const clientProjects = projects.filter(p => p.clientId === clientId)

    for (const p of clientProjects) {
      if (p.publishState?.status === 'live') {
        const dbId = p.publishState.galleryDbId || p.id
        deleteGalleryFromCloud(dbId).then(({ error }) => {
          if (error) console.error('[delete-cloud]', error)
        })
      }
    }

    const deletedIds = new Set(clientProjects.map(p => p.id))
    setProjects(prev => {
      const updated = prev.filter(p => !deletedIds.has(p.id))
      const allUsedIds = new Set(updated.flatMap(p => p.imageIds))
      const orphanedImageIds = clientProjects.flatMap(p => p.imageIds).filter(id => !allUsedIds.has(id))
      if (orphanedImageIds.length > 0) {
        setImageRegistry(regPrev => {
          const cleaned = { ...regPrev }
          for (const imgId of orphanedImageIds) delete cleaned[imgId]
          return cleaned
        })
      }
      return updated
    })

    setClients(prev => prev.filter(c => c.id !== clientId))

    if (selectedClientId === clientId) {
      setSelectedClientId(null)
      setView('clients')
    }
    if (currentProjectId && deletedIds.has(currentProjectId)) {
      setCurrentProjectId(null)
      isHydratingProject.current = true
      try {
        useGallery.setState({ images: [], folderPath: '', topPickIds: new Set() })
        useSections.setState({ sections: [], activeSectionFilter: null })
      } finally {
        isHydratingProject.current = false
      }
    }
  }

  // Go back to workspace
  const goWorkspace = () => {
    if (currentProjectId) {
      forceSaveCurrentProject()
    }
    setCurrentProjectId(null)
    setView('workspace')
    // Guard: prevent the live-mirror subscription from overwriting the saved
    // project with empty topPickIds/sections when we clear the stores.
    isHydratingProject.current = true
    try {
      useGallery.setState({ images: [], folderPath: '', topPickIds: new Set() })
      useSections.setState({ sections: [], activeSectionFilter: null })
    } finally {
      isHydratingProject.current = false
    }
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

  // Reset sections only when the user opens a brand-new folder (real path
  // → real path). Skip on hydration / clearing (folderPath transitions to or
  // from ''), otherwise switching back into a project would wipe its
  // persisted sections seconds after we hydrate them.
  const prevFolderPath = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevFolderPath.current
    prevFolderPath.current = folderPath
    if (prev && folderPath && prev !== folderPath) {
      resetForFolder()
    }
  }, [folderPath])

  return (
    <div className="app">
      {missingPaths.size > 0 && !missingDismissed && (
        <MissingFilesBanner
          missingCount={missingPaths.size}
          onLocate={handleRelinkFolder}
          onDismiss={() => setMissingDismissed(true)}
        />
      )}
      {!welcomed && (
        <WelcomeScreen
          onDismiss={() => setWelcomed(true)}
          onNewProject={() => {
            setIsImportOpen(false)
            setIsNewProjectModalOpen(true)
          }}
          onOpenExisting={() => {
            setIsNewProjectModalOpen(false)
            setWelcomed(true)
          }}
        />
      )}
      {currentProjectId && (
        <Toolbar
          currentProject={currentProject?.name || null}
          projects={projects}
          onImport={() => { setImportInitialView('menu'); setIsImportOpen(true) }}
          onImportCreate={() => { setImportInitialView('create'); setIsImportOpen(true) }}
          backLabel={navOrigin.type === 'clientDetail'
            ? (clients.find(c => c.id === navOrigin.clientId)?.name || 'Client')
            : 'Workspace'}
          onGoBack={navOrigin.type === 'clientDetail'
            ? () => {
                forceSaveCurrentProject()
                setCurrentProjectId(null)
                setSelectedClientId(navOrigin.clientId)
                setView('clientDetail')
                isHydratingProject.current = true
                try {
                  useGallery.setState({ images: [], folderPath: '', topPickIds: new Set() })
                  useSections.setState({ sections: [], activeSectionFilter: null })
                } finally {
                  isHydratingProject.current = false
                }
              }
            : goWorkspace}
          onGoWorkspace={goWorkspace}
          onSwitchProject={(id) => switchToProject(id)}
        />
      )}

      {/* Review mode bar */}
      {isReviewMode && currentProjectId && (
        <div style={{
          // @ts-expect-error electron
          WebkitAppRegion: 'no-drag',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: '8px 20px',
          background: 'linear-gradient(90deg, rgba(99,102,241,.15), rgba(168,85,247,.1))',
          borderBottom: '1px solid rgba(99,102,241,.2)',
          flexShrink: 0,
        }}>
          <button onClick={exitReviewMode} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,.5)',
            cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}>✕ Exit</button>

          <button onClick={reviewPrev} disabled={reviewIndex <= 0} style={{
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 6, padding: '5px 12px', cursor: reviewIndex > 0 ? 'pointer' : 'default',
            color: reviewIndex > 0 ? '#fff' : 'rgba(255,255,255,.25)',
            fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
          }}>← Prev</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700,
              background: 'rgba(99,102,241,.2)', color: '#c7d2fe',
            }}>
              {reviewIndex + 1} / {reviewQueue.length}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              {currentProject?.name}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
              Select top picks with T, then click Next
            </span>
          </div>

          <button onClick={reviewNext} style={{
            background: '#6366f1', border: 'none', borderRadius: 6,
            padding: '5px 16px', cursor: 'pointer', color: '#fff',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(99,102,241,.3)',
          }}>
            {reviewIndex >= reviewQueue.length - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      )}

      {/* Workspace or Gallery */}
      {welcomed && !currentProjectId && view === 'workspace' ? (
        <WorkspaceDashboard
          projects={projects}
          clients={clients}
          imageRegistry={imageRegistry}
          onNewProject={() => { setImportInitialView('create'); setIsImportOpen(true) }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onBulkImport={async (clientName, folders) => {
            const now = new Date().toISOString()
            // Find or create client
            const normalized = clientName.trim().toLowerCase()
            let clientId: string | null = null
            const existingClient = clients.find(c => c.name.toLowerCase() === normalized)
            if (existingClient) {
              clientId = existingClient.id
            } else {
              clientId = `client_${Date.now()}`
              setClients(prev => [...prev, { id: clientId!, name: clientName.trim(), createdAt: now, updatedAt: now }])
            }

            // Create a project per folder and scan images
            const newProjects: typeof projects = []
            const newRegistry = { ...imageRegistry }
            for (const folder of folders) {
              const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6)
              const scanned = await window.api.scanFolder(folder.path)
              const imageIds: string[] = []
              for (const file of scanned) {
                const imgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                newRegistry[imgId] = {
                  id: imgId,
                  filename: file.filename,
                  path: file.path,
                  folderPath: file.folderPath,
                  ext: file.ext,
                  size: file.size,
                  mtimeMs: file.mtimeMs,
                  birthtimeMs: file.birthtimeMs,
                } as ImageFile
                imageIds.push(imgId)
              }
              newProjects.push({
                id, name: folder.name, clientId, clientName: clientName.trim(),
                imageIds, createdAt: now, updatedAt: now,
              })
            }
            setImageRegistry(newRegistry)
            imageRegistryRef.current = newRegistry
            const updatedProjects = [...projectsRef.current, ...newProjects]
            setProjects(updatedProjects)
            projectsRef.current = updatedProjects
            useGallery.getState().addToast(`Imported ${newProjects.length} galleries for ${clientName}`, 'success')

            // Open first project so user can start tagging
            if (newProjects.length > 0) {
              switchToProject(newProjects[0].id)
            }
          }}
          onSelectProject={(id) => { setNavOrigin({ type: 'workspace' }); switchToProject(id) }}
          onSelectClient={(id) => { setSelectedClientId(id); setView('clientDetail') }}
          onDeleteProject={(id) => {
            const project = projects.find(p => p.id === id)
            // Delete from cloud if published
            if (project?.publishState?.status === 'live') {
              const dbId = project.publishState.galleryDbId || project.id
              deleteGalleryFromCloud(dbId).then(({ error }) => {
                if (error) console.error('[delete-cloud]', error)
              })
            }
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
          onDeleteClient={(id) => deleteClientCascade(id)}
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
              onSelectProject={(id) => { setNavOrigin({ type: 'clientDetail', clientId: client.id }); switchToProject(id) }}
              onDeleteProject={(id) => {
                const project = projects.find(p => p.id === id)
                if (project?.publishState?.status === 'live') {
                  const dbId = project.publishState.galleryDbId || project.id
                  deleteGalleryFromCloud(dbId).then(({ error }) => {
                    if (error) console.error('[delete-cloud]', error)
                  })
                }
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
              onUpdateEventType={(projectId, eventType) => {
                setProjects(prev => prev.map(p => {
                  if (p.id !== projectId) return p
                  // Update both project.eventType AND delivery_settings.eventType
                  const ds = { ...(p.deliverySettings || {} as any), eventType: eventType || '' }
                  return { ...p, eventType: eventType || undefined, deliverySettings: ds, updatedAt: new Date().toISOString() }
                }))
              }}
              onUpdateAll={async (projectIds) => {
                // SAFE bulk update: directly update Supabase without touching gallery stores.
                // No hydration, no store mutations — just DB writes per gallery.
                useGallery.getState().addToast(`Updating ${projectIds.length} galleries...`, 'info')
                let done = 0
                for (const id of projectIds) {
                  const proj = projectsRef.current.find(p => p.id === id)
                  if (!proj?.publishState?.galleryDbId) continue
                  const galleryDbId = proj.publishState.galleryDbId
                  try {
                    // 1) Update is_top_pick by matching filenames
                    const topPickIds = new Set(proj.topPickIds || [])
                    const topPickFilenames = new Set<string>()
                    for (const imgId of topPickIds) {
                      const img = imageRegistryRef.current[imgId]
                      if (img) topPickFilenames.add(img.filename)
                    }
                    const { data: cloudImgs } = await supabase.from('images')
                      .select('id, filename').eq('gallery_id', galleryDbId)
                    if (cloudImgs) {
                      for (const ci of cloudImgs) {
                        await supabase.from('images')
                          .update({ is_top_pick: topPickFilenames.has(ci.filename) })
                          .eq('id', ci.id)
                      }
                    }

                    // 2) Update delivery settings (eventType etc.)
                    const settings = { ...(proj.deliverySettings || {}) }
                    if (proj.eventType) (settings as Record<string, unknown>).eventType = proj.eventType
                    await supabase.from('galleries')
                      .update({ delivery_settings: settings })
                      .eq('id', galleryDbId)

                    done++
                    if (done % 5 === 0 || done === projectIds.length) {
                      useGallery.getState().addToast(`Updated ${done}/${projectIds.length}`, 'info')
                    }
                  } catch (err) {
                    console.error(`[bulk-update] ${proj.name} failed:`, err)
                  }
                }
                useGallery.getState().addToast(`Done! ${done}/${projectIds.length} galleries updated`, 'success')
              }}
              onPublishAll={(projectIds) => {
                // Store the queue and open publish settings for the first gallery.
                // After user configures settings and publishes the first one,
                // the rest will auto-publish with the same settings.
                setBulkPublishQueue(projectIds)
                setBulkPublishProgress(0)
                if (projectIds.length > 0) {
                  setPublishProjectId(projectIds[0])
                  setPublishPhase('settings')
                  useGallery.getState().addToast(
                    `Configure settings once — they'll apply to all ${projectIds.length} galleries. Gallery names and event types stay as-is.`,
                    'info'
                  )
                }
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
              hasUnsavedChanges={
                currentProject?.publishState?.status === 'live' && (
                  (!!currentProject?.publishState?.publishedImageIds &&
                    JSON.stringify(currentProject.imageIds) !== JSON.stringify(currentProject.publishState.publishedImageIds))
                  || sectionsDirtyAt > 0
                )
              }
              onPublish={async () => {
                if (!currentProjectId) return
                const proj = projects.find(p => p.id === currentProjectId)
                if (!proj) return

                // If gallery is live and has any unsaved changes (images OR sections) → full sync
                const imagesChanged = proj.publishState?.status === 'live' &&
                  !!proj.publishState?.publishedImageIds &&
                  JSON.stringify(proj.imageIds) !== JSON.stringify(proj.publishState.publishedImageIds)
                const sectionsChanged = proj.publishState?.status === 'live' && sectionsDirtyAt > 0

                if (imagesChanged || sectionsChanged) {
                  await handleUpdateChanges(currentProjectId)
                  return
                }

                // Otherwise open publish/edit settings panel
                setPublishProjectId(currentProjectId)
                setPublishPhase(proj?.publishState?.status === 'live' ? 'editing' : 'settings')
              }}
            />
          )}

          <VendorsPanel />

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
      {publishProjectId && !isPublishHidden && (() => {
        const project = projects.find(p => p.id === publishProjectId)
        if (!project) return null
        const settings = migrateSettings((project.deliverySettings || {}) as Record<string, unknown>, project.eventType)
        return (
          <PublishPanel
            projectName={project.name}
            clientName={project.clientName}
            imageCount={project.imageIds.length}
            topPickCount={galleryTopPickIds.size}
            settings={settings}
            projectImages={project.imageIds.map(id => imageRegistry[id]).filter(Boolean).map(img => ({ id: img.id, path: toLocalURL(img.path) }))}
            isAlreadyLive={project.publishState?.status === 'live'}
            onSettingsChange={(s) => {
              setProjects(prev => prev.map(p => p.id === publishProjectId ? { ...p, deliverySettings: s } : p))
              saveLastUsedSettings(s)
            }}
            onPublish={() => {
              if (publishPhase === 'editing') return handleUpdateSettings(publishProjectId)
              if (project.publishState?.status === 'live') return handleUpdateChanges(publishProjectId)
              return handlePublish(publishProjectId)
            }}
            onClose={() => { setPublishProjectId(null); setPublishPhase('settings'); setIsPublishHidden(false) }}
            phase={publishPhase}
            error={pubError}
            publicUrl={publishGalleryDir.startsWith('http') ? publishGalleryDir : project?.publishState?.publicUrl}
            onRetry={() => handlePublish(publishProjectId)}
            onHide={publishPhase === 'publishing' ? () => setIsPublishHidden(true) : undefined}
            onCancel={publishPhase === 'publishing' ? () => {
              cancelUpload()
              setPublishPhase('error')
              setPubError('Upload cancelled')
              setProjects(prev => prev.map(p => p.id === publishProjectId
                ? { ...p, publishState: { ...p.publishState!, status: 'draft' } }
                : p
              ))
            } : undefined}
          />
        )
      })()}

      {/* Upload progress floater (shown when publish panel is hidden) */}
      {isPublishHidden && publishProjectId && (
        <UploadFloater onExpand={() => setIsPublishHidden(false)} />
      )}

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
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
      {isSettingsOpen && (
        <BusinessSettingsModal
          settings={businessSettings}
          onSave={(s) => {
            setBusinessSettings(s)
            currentBusinessSettings = s
            window.api.setPref('businessSettings', s)
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {upgradeInfo && (
        <UpgradeModal
          planName={upgradeInfo.planName}
          violations={upgradeInfo.violations}
          onUpgrade={async () => {
            setUpgradeInfo(null)
            try {
              const { openCheckout } = await import('./lib/checkout')
              await openCheckout('pro')
            } catch (err) {
              console.error('[upgrade]', err)
              window.open('https://pixflow-ai.com/#pricing', '_blank')
            }
          }}
          onClose={() => setUpgradeInfo(null)}
        />
      )}
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
            useSections.getState().assignImagesToSection(toAdd.map(i => i.id), newSection.id)
            if (!useSections.getState().isPanelOpen) useSections.getState().togglePanel()
          }}
          onCreateProject={async (name, clientName, eventType) => {
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
            const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, imageIds: [], eventType: eventType || undefined, createdAt: now, updatedAt: now }
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
            useSections.getState().assignImagesToSection(toAdd.map(i => i.id), newSection.id)
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
          setNewProjectClientName(''); setNewProjectSelectedClientId(null); setNewProjectShowSuggestions(false); setNewProjectSaveClient(false); setNewProjectEventType('')
          const id = String(nextId); setNextId(n => n + 1)
          const newProject: ProjectData = { id, name, clientId, clientName: resolvedClientName, imageIds: [], eventType: newProjectEventType || undefined, createdAt: now, updatedAt: now }
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
        const closeModal = () => { setIsNewProjectModalOpen(false); setNewProjectClientName(''); setNewProjectSelectedClientId(null); setNewProjectShowSuggestions(false); setNewProjectSaveClient(false); setNewProjectEventType('') }

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

              {/* Event type */}
              <label className="npm__label" style={{ marginTop: 12 }}>Event type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {[
                  { value: 'conference', label: 'Conference' },
                  { value: 'corporate-event', label: 'Corporate Event' },
                  { value: 'government', label: 'Government' },
                  { value: 'retreat-abroad', label: 'Retreat Abroad' },
                  { value: 'retreat-local', label: 'Local Retreat' },
                  { value: 'pre-event', label: 'Pre-Event' },
                  { value: 'other', label: 'Other' },
                ].map(opt => {
                  const active = newProjectEventType === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setNewProjectEventType(active ? '' : opt.value)}
                      className={`npm__chip ${active ? 'npm__chip--active' : ''}`}
                      style={{ padding: '6px 12px', fontSize: 11, borderRadius: 50 }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* Create */}
              <button className="npm__create" onClick={doCreate} style={{ marginTop: 12 }}>
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

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
