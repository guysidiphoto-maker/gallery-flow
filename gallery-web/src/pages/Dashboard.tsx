import React, { useState, useEffect, useRef } from 'react'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { supabase, storageUrl } from '../supabase'
import { uploadMany } from '../lib/uploadPipeline'
import { signedStorageUrl } from '../lib/signedStorage'
import { SignedImg } from '../components/SignedImg'
import { getMyTokenBalance, startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { Icon, type IconName } from '../components/Icon'
import { useFocusTrap } from '../lib/useFocusTrap'

interface Gallery {
  id: string
  name: string
  image_count: number
  published_at: string | null
  status: string
  delivery_settings?: Record<string, unknown>
  download_count?: number
  favorite_count?: number
}

interface GalleryImage {
  id: string
  filename: string
  storage_path: string
  thumbnail_path: string | null
  is_top_pick: boolean
  sort_order: number
  section_id?: string | null
}

// Editorial-minimal theme. Pic-Time-inspired "quiet magazine" aesthetic:
// warm cream canvas, near-black type, NO brand color in primary actions
// (CTA is outlined-black on cream, inverts on hover), uppercase tracked
// eyebrow labels for hierarchy, hairline borders + soft elevation.
const accent = '#141413'              // near-black, used for emphasis + outlined CTA
const accentLight = '#000000'         // pure black on hover
const accentGlow = 'rgba(20,20,19,.08)'
const bg = '#F2EFE9'                  // warm cream canvas
const bgSubtle = '#FAF9F5'            // section panels
const card = '#FBFBF9'                // raised surfaces
const cardSolid = '#FFFFFF'           // inner pickers, modal whites
const border = '#D0D0D0'              // hairline 1px borders
const borderHover = '#141413'
const textPrimary = '#141413'         // headings + UI text
const textSecondary = '#333333'       // body copy
const textMuted = '#767470'           // captions, secondary metadata. Darkened
                                       // from #BCBCBC (1.6:1) to pass WCAG-AA
                                       // 4.5:1 contrast on the cream canvas.
const glass = '#FAF9F5'
// Status dot for "published". Subtle sage so it reads as semantic, not branding.
const statusLive = '#7B8F6E'

/* ---- reusable keyframes injected once ---- */
const styleId = 'dashboard-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes modalIn  { from { opacity:0; transform:scale(.96) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes shimmer  { from { background-position: -400px 0; } to { background-position: 400px 0; } }
    .dash-toggle { min-width:52px !important; width:52px !important; height:30px !important; border-radius:30px !important; border:none !important; cursor:pointer; padding:3px !important; flex-shrink:0; display:flex !important; align-items:center !important; transition:background .2s; }
    .dash-toggle-off { background:rgba(0,0,0,.08) !important; }
    .dash-toggle-on  { background:#2DC479 !important; }
    .dash-toggle-knob { width:24px !important; height:24px !important; border-radius:50% !important; background:#fff !important; box-shadow:0 1px 6px rgba(0,0,0,.35); transition:transform .25s cubic-bezier(.4,.2,.2,1); }
    .dash-toggle-on .dash-toggle-knob { transform:translateX(22px); }
    @keyframes pulse    { 0%,100% { opacity:.4; } 50% { opacity:1; } }
    @keyframes overlayIn { from { opacity:0; } to { opacity:1; } }

    /* Universal focus ring for keyboard nav. Required for WCAG-AA. We use
       :focus-visible (not :focus) so mouse users don't see rings on click,
       only keyboard users do. */
    .dash button:focus-visible,
    .dash a:focus-visible,
    .dash input:focus-visible,
    .dash textarea:focus-visible,
    .dash select:focus-visible {
      outline: 2px solid #141413;
      outline-offset: 2px;
      border-radius: 2px;
    }

    /* Sidebar mobile transformation. Above 900px the sidebar is a permanent
       sticky 240px column. Below 900px it becomes an off-canvas drawer that
       slides in from the right (RTL); the hamburger button in the topbar
       toggles it; a backdrop dims the rest. */
    @media (max-width: 900px) {
      .dash-sidebar {
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        height: 100vh !important;
        transform: translateX(100%);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
        box-shadow: -8px 0 32px rgba(0,0,0,.4);
      }
      .dash-sidebar.dash-sidebar--open {
        transform: translateX(0);
      }
      .dash-sidebar-backdrop { display: block !important; }
      .dash-hamburger { display: flex !important; }
    }

    /* Honor the OS-level "reduce motion" preference. Required by WCAG and
       prevents the cascade of fadeInUp/modalIn/shimmer entrances from
       triggering vestibular-disorder symptoms. We zero animation duration
       (not display:none) so the visual end-state is what users see. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `
  document.head.appendChild(style)
}

export function Dashboard() {
  const { user, loading } = useAuth()
  const [galleries, setGalleries] = useState<Gallery[]>([])
  // Cover-image fallback map — gallery_id → first image URL. Filled in by a
  // useEffect after galleries load. The desktop uploader doesn't set
  // delivery_settings.coverImageUrl, so without this every desktop-uploaded
  // gallery would show a grey placeholder.
  const [coverFallback, setCoverFallback] = useState<Record<string, string>>({})
  const [loadingGalleries, setLoadingGalleries] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessSlug, setBusinessSlug] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState<number>(0)
  const [showBuyTokens, setShowBuyTokens] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Gallery editor
  const [editingGallery, setEditingGallery] = useState<Gallery | null>(null)
  const [editTab, setEditTab] = useState<'photos' | 'settings' | 'activities' | 'sections' | 'welcome' | 'stories'>('photos')
  const [sections, setSections] = useState<Array<{ id: string; name: string; sort_order: number }>>([])
  const [newSectionName, setNewSectionName] = useState('')
  const [newSectionDesc, setNewSectionDesc] = useState('')
  // Sidebar Set behavior: active filter (null = "All photos"), inline-rename
  // target, and the "+ Add Set" modal toggle. Mirrors Pixieset's pattern.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null)
  const [sectionMenuOpenId, setSectionMenuOpenId] = useState<string | null>(null)
  const [showAddSetModal, setShowAddSetModal] = useState(false)
  const [activitySummary, setActivitySummary] = useState<{
    downloads_total: number
    favorites_total: number
    emails_total: number
    recent_downloads: Array<{ id: string; image_id: string | null; resolution: string; download_kind: string; created_at: string }>
    recent_favorites: Array<{ id: string; image_id: string; guest_name: string | null; note: string | null; created_at: string }>
    recent_emails: Array<{ id: string; recipient_email: string; subject: string | null; status: string; created_at: string }>
  } | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  // Photo-grid view state — hovered tile + open per-tile menu + grid size
  // (Pixieset offers Regular/Large) + sort order.
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [imageMenuOpenId, setImageMenuOpenId] = useState<string | null>(null)
  const [gridSize, setGridSize] = useState<'regular' | 'large'>('regular')
  const [photoSort, setPhotoSort] = useState<'order' | 'name' | 'newest'>('order')
  // Drag-to-reorder state. Only meaningful when photoSort === 'order'.
  // dragOverId is the tile the cursor is currently above (drop target);
  // a leading-edge bar on it shows where the drop will land. Keyboard
  // users get the same reorder via Move-up / Move-down items in the
  // per-tile "..." menu.
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // Design tab — Pixieset's pattern: 5 horizontal sub-tabs at the top of
  // the right pane. Cover holds the welcome screen + cover image picker;
  // Typography/Color/Grid/Nav write to delivery_settings JSONB so they
  // ship without a schema migration.
  const [designSubTab, setDesignSubTab] = useState<'cover' | 'type' | 'color' | 'grid' | 'nav'>('cover')
  const [uploading, setUploading] = useState(false)
  const [uploadBatch, setUploadBatch] = useState<{ completed: number; total: number; failed: number; current?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Stories tab — the editor lets owners upload MP4 clips per gallery and
  // delete individual stories. Mirrors the photo grid pattern: list state,
  // a hidden <input type=file> driven by a ref, and a per-row hover/menu state.
  const [stories, setStories] = useState<Array<{ id: string; style: string | null; storage_path: string; duration: number | null; created_at?: string }>>([])
  const [storyUploading, setStoryUploading] = useState(false)
  const [storyUploadProgress, setStoryUploadProgress] = useState<{ pct: number; filename: string } | null>(null)
  const [hoveredStoryId, setHoveredStoryId] = useState<string | null>(null)
  const [storyMenuOpenId, setStoryMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteStoryId, setConfirmDeleteStoryId] = useState<string | null>(null)
  const storyFileInputRef = useRef<HTMLInputElement>(null)

  // New delivery settings state
  const [welcomeStyle, setWelcomeStyle] = useState<'mosaic' | 'cinematic' | 'minimal'>('mosaic')
  const [clientHidePhotosEnabled, setClientHidePhotosEnabled] = useState(false)
  const [requireGalleryCode, setRequireGalleryCode] = useState(false)
  const [galleryCode, setGalleryCode] = useState('')
  const [trackDownloads, setTrackDownloads] = useState(false)
  const [feedLayout, setFeedLayout] = useState<'grid' | 'masonry' | 'carousel'>('grid')
  // Face recognition (זיהוי פנים) — opt-in feature with token cost. The
  // confirm dialog explains the cost before turning on; once on, a privacy
  // mode picker appears so the photographer chooses whether everyone sees
  // everything (open) or each guest only sees their own selfie matches (private).
  const [faceRecognition, setFaceRecognition] = useState(false)
  const [facePrivacyMode, setFacePrivacyMode] = useState<'open' | 'private'>('open')
  const [showFaceConfirm, setShowFaceConfirm] = useState(false)

  // ── Custom domain (account-level) ──────────────────────────────────────────
  // The Domain section lives at the bottom of the per-gallery Settings tab
  // for now (no studio-level settings page yet). State is account-scoped:
  // `customDomainEnabled` mirrors the photographer's plan flag, the rest
  // mirrors the businesses row. `domainSaving` covers RPC in-flight; the
  // re-verify button is a stub until PR 3b wires the actual DNS check.
  type CustomDomainStatus = 'unverified' | 'pending_dns' | 'verified' | 'error'
  const [customDomainEnabled, setCustomDomainEnabled] = useState<boolean>(false)
  const [customDomain, setCustomDomain] = useState<string | null>(null)
  const [customDomainStatus, setCustomDomainStatus] = useState<CustomDomainStatus>('unverified')
  const [customDomainToken, setCustomDomainToken] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState<string>('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)

  useEffect(() => {
    if (!user) return
    initBusiness()
  }, [user])

  // Pull the photographer's plan flag + current domain claim once the
  // business id is known. Both queries are scoped by RLS — the plan call
  // returns the caller's own active subscription, and the businesses row
  // is only readable by its owner. Errors are non-fatal: the UI will fall
  // back to the upsell card if we can't tell whether the plan allows it.
  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const planPromise = supabase.rpc('get_my_plan')
      const bizPromise = supabase
        .from('businesses')
        .select('custom_domain, custom_domain_status, custom_domain_verification_token')
        .eq('id', businessId)
        .maybeSingle()
      const [{ data: planRows }, { data: bizRow }] = await Promise.all([planPromise, bizPromise])
      if (cancelled) return
      const plan = Array.isArray(planRows) ? planRows[0] : planRows
      setCustomDomainEnabled(Boolean((plan as { custom_domain_enabled?: boolean } | null)?.custom_domain_enabled))
      const row = bizRow as {
        custom_domain?: string | null
        custom_domain_status?: CustomDomainStatus | null
        custom_domain_verification_token?: string | null
      } | null
      setCustomDomain(row?.custom_domain ?? null)
      setCustomDomainStatus((row?.custom_domain_status as CustomDomainStatus) ?? 'unverified')
      setCustomDomainToken(row?.custom_domain_verification_token ?? null)
    })()
    return () => { cancelled = true }
  }, [businessId])

  // Cover-image fallback. Run after galleries load. For each gallery whose
  // delivery_settings.coverImageUrl is unset, fetch the first image's
  // thumbnail and stash it in the coverFallback map. The desktop app
  // doesn't set coverImageUrl on upload, so without this every
  // desktop-uploaded gallery shows a grey placeholder.
  useEffect(() => {
    let cancelled = false
    const targets = galleries.filter(g =>
      !((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl)
      && (g.image_count ?? 0) > 0
      && !coverFallback[g.id]
    )
    if (targets.length === 0) return
    void (async () => {
      const results = await Promise.all(targets.map(async g => {
        // The images table only has thumbnail_path + web_preview_path. The
        // dashboard's gallery editor reads `storage_path:web_preview_path`
        // as an alias; if we ask for the unaliased column the query 400s
        // with "column images.storage_path does not exist".
        const { data: img, error } = await supabase
          .from('images')
          .select('thumbnail_path, web_preview_path')
          .eq('gallery_id', g.id)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (error) {
          console.warn('[cover-fallback] fetch failed for', g.id, error)
          return null
        }
        if (!img) return null
        const path = img.thumbnail_path || img.web_preview_path
        if (!path) return null
        return { id: g.id, url: storageUrl('gallery-images', path) }
      }))
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const r of results) if (r) next[r.id] = r.url
      if (Object.keys(next).length > 0) {
        setCoverFallback(prev => ({ ...prev, ...next }))
      }
    })()
    return () => { cancelled = true }
  }, [galleries])

  // Lazy-load activity summary when the tab opens. Re-fetches when switching
  // galleries, but caches per-gallery within the editor session.
  useEffect(() => {
    if (editTab !== 'activities' || !editingGallery) return
    setActivityLoading(true)
    supabase
      .rpc('gallery_activity_summary', { p_gallery_id: editingGallery.id })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[activities] fetch failed', error)
          setActivitySummary(null)
        } else if (data) {
          setActivitySummary(data as typeof activitySummary)
        }
        setActivityLoading(false)
      })
  }, [editTab, editingGallery?.id])

  async function initBusiness() {
    // Look up existing business for this user
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, slug')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (biz) {
      setBusinessId(biz.id)
      setBusinessSlug(biz.slug)
    } else {
      // Auto-create a business record for new users
      const displayName = user!.user_metadata?.full_name || user!.user_metadata?.name || user!.email || 'Studio'
      const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
      const { data: newBiz, error } = await supabase
        .from('businesses')
        .insert({ user_id: user!.id, business_name: displayName, slug })
        .select('id, slug')
        .single()
      if (error) {
        console.error('Failed to create business:', error)
      } else if (newBiz) {
        setBusinessId(newBiz.id)
        setBusinessSlug(newBiz.slug)
      }
    }
    fetchGalleries()
    fetchTokenBalance()
  }

  async function fetchTokenBalance() {
    const balance = await getMyTokenBalance()
    setTokenBalance(balance)
  }

  async function fetchGalleries() {
    setLoadingGalleries(true)
    // First get business ID if not yet loaded
    let bId = businessId
    if (!bId) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      bId = biz?.id ?? null
      if (bId) setBusinessId(bId)
    }
    if (!bId) {
      setGalleries([])
      setLoadingGalleries(false)
      return
    }
    const { data, error } = await supabase
      .from('galleries')
      .select('id, name, image_count, published_at, status, download_count, favorite_count, delivery_settings')
      .eq('business_id', bId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch galleries error:', error)
    setGalleries(data ?? [])
    setLoadingGalleries(false)
  }

  async function createGallery() {
    if (!newName.trim()) return
    if (!businessId) {
      alert('שגיאה: לא נמצא חשבון עסקי. נסו לרענן את הדף.')
      return
    }
    setCreating(true)
    const { error } = await supabase.from('galleries').insert({
      name: newName.trim(),
      business_id: businessId,
      status: 'draft',
      image_count: 0,
      face_index_enabled: faceRecognition,
      delivery_settings: {
        faceIndexEnabled: faceRecognition,
        facePrivacyMode,
        accessType: 'public',
        password: null,
        downloadsEnabled: true,
        bulkDownloadEnabled: false,
        downloadQuality: 'web',
        studioName: '',
        logoUrl: null,
        showFooterCredit: true,
        galleryTitle: newName.trim(),
        clientName: '',
        coverImageId: null,
        coverImageUrl: null,
        coverCrop: null,
        galleryDescription: '',
        eventDate: newDate || '',
        eventLocation: '',
        eventType: '',
        clientSelectionEnabled: false,
        clientCode: '',
        layoutMode: '2-col',
        imageSpacing: 'small',
        cornerStyle: 'rounded',
        generateStories: false,
        showStories: true,
        welcomeStyle,
        clientHidePhotosEnabled,
        requireGalleryCode,
        galleryCode: requireGalleryCode ? galleryCode : '',
        trackDownloads,
        feedLayout,
      },
    })
    setCreating(false)
    if (error) {
      console.error('Gallery creation failed:', error)
      alert(`שגיאה ביצירת גלריה: ${error.message}`)
      return
    }
    setShowModal(false)
    setNewName('')
    setNewDate('')
    setWelcomeStyle('mosaic')
    setClientHidePhotosEnabled(false)
    setRequireGalleryCode(false)
    setGalleryCode('')
    setTrackDownloads(false)
    setFeedLayout('grid')
    setFaceRecognition(false)
    setFacePrivacyMode('open')
    fetchGalleries()
  }

  async function openGalleryEditor(g: Gallery) {
    setEditingGallery(g)
    setEditTab('photos')
    setStories([])
    const [imagesRes, sectionsRes, storiesRes] = await Promise.all([
      supabase
        .from('images')
        .select('id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick, sort_order, section_id')
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('gallery_sections')
        .select('id, name, sort_order')
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
      // Stories — fetched alongside images so switching to the Stories tab
      // is instant. The owner-only editor reads the table directly because
      // the dashboard runs as the photographer; the public viewer goes
      // through gallery_get_stories with a token instead.
      supabase
        .from('stories')
        .select('id, style, storage_path, duration, created_at')
        .eq('gallery_id', g.id)
        .order('created_at', { ascending: true }),
    ])
    setGalleryImages(imagesRes.data ?? [])
    setSections(sectionsRes.data ?? [])
    setStories(storiesRes.data ?? [])
  }

  async function addSection() {
    if (!editingGallery || !newSectionName.trim()) return
    const { data, error } = await supabase
      .from('gallery_sections')
      .insert({
        gallery_id: editingGallery.id,
        name: newSectionName.trim(),
        sort_order: sections.length,
      })
      .select('id, name, sort_order')
      .single()
    if (error) { alert('שגיאה: ' + error.message); return }
    if (data) setSections(prev => [...prev, data])
    setNewSectionName('')
    setNewSectionDesc('')
    setShowAddSetModal(false)
    if (data) setActiveSectionId(data.id)
  }

  async function renameSection(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const { error } = await supabase.from('gallery_sections').update({ name: trimmed }).eq('id', id)
    if (error) { alert('שגיאה: ' + error.message); return }
    setSections(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s))
  }

  async function deleteSection(id: string) {
    if (!confirm('למחוק את הקטע? התמונות שבתוכו יישארו בגלריה.')) return
    // First unset section_id on images so they don't disappear from the gallery
    await supabase.from('images').update({ section_id: null }).eq('section_id', id)
    const { error } = await supabase.from('gallery_sections').delete().eq('id', id)
    if (error) { alert('שגיאה: ' + error.message); return }
    setSections(prev => prev.filter(s => s.id !== id))
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !editingGallery || !businessId || !businessSlug) return
    if (tokenBalance < files.length) {
      const wanted = files.length
      const have = tokenBalance
      alert(`אין מספיק טוקנים. צריך ${wanted}, יש לך ${have}. רכוש חבילה כדי להמשיך.`)
      setShowBuyTokens(true)
      return
    }
    setUploading(true)
    setUploadBatch({ completed: 0, total: files.length, failed: 0 })
    const result = await uploadMany(
      Array.from(files),
      {
        galleryId: editingGallery.id,
        businessSlug,
        sortOrder: galleryImages.length,
      },
      (b) => setUploadBatch(b),
      3,
    )
    if (result.failed.length > 0) {
      const insufficient = result.failed.find(f => f.error.includes('insufficient_tokens'))
      if (insufficient) {
        alert('הטוקנים נגמרו באמצע ההעלאה. רכוש חבילה כדי להמשיך עם השאר.')
        setShowBuyTokens(true)
      } else {
        alert(`${result.failed.length} תמונות נכשלו. השאר עלו בהצלחה.`)
      }
    }
    // Refresh balance + image list
    fetchTokenBalance()
    const { data } = await supabase
      .from('images')
      .select('id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick, sort_order')
      .eq('gallery_id', editingGallery.id)
      .order('sort_order', { ascending: true })
    setGalleryImages(data ?? [])
    setUploading(false)
    setUploadBatch(null)

    // Re-trigger face indexing if the gallery is already live AND has face
    // recognition on. The rekognition function is idempotent — it skips
    // already-indexed images and only processes the new ones, so calling it
    // after every batch is safe and cheap. Without this, photos added
    // post-publish are silently invisible to FaceFinder.
    const needsReindex =
      editingGallery.status === 'live' &&
      (editingGallery.delivery_settings as { faceIndexEnabled?: boolean } | null)?.faceIndexEnabled === true
    if (needsReindex && result.ok.length > 0) {
      void supabase.functions.invoke('rekognition', {
        body: { action: 'index_gallery', galleryId: editingGallery.id },
      }).catch(err => console.warn('[face-index reindex]', err))
    }

    fetchGalleries()
  }

  // ─── Stories: upload + delete ───────────────────────────────────────────
  // Owner-only operations. Storage path mirrors the desktop renderer's
  // canonical layout (`{slug}/{galleryId}/story_{style}.mp4`) so existing
  // public-read RLS + the gallery_get_stories RPC keep working without a
  // schema change. We tag manual uploads with style='manual-<timestamp>' to
  // avoid colliding with desktop-generated stories that share the same path.
  const STORY_BUCKET = 'gallery-stories'
  const STORY_MAX_BYTES = 100 * 1024 * 1024 // 100MB per upload

  /** Probe video metadata client-side so we can persist `duration` (rounded
   *  to whole seconds, matching the integer column). The <video> element is
   *  the only widely-supported way to read duration from a Blob without
   *  a server roundtrip. Falls back to null on unreadable files. */
  function readVideoDurationSeconds(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      // Some browsers refuse to load metadata unless the element is in the
      // DOM — keep it offscreen but attached.
      video.style.position = 'fixed'
      video.style.left = '-9999px'
      video.style.top = '-9999px'
      const cleanup = () => {
        URL.revokeObjectURL(url)
        video.remove()
      }
      video.onloadedmetadata = () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration)
          : null
        cleanup()
        resolve(dur)
      }
      video.onerror = () => { cleanup(); resolve(null) }
      // Hard timeout — never block the upload waiting for metadata.
      setTimeout(() => { cleanup(); resolve(null) }, 5000)
      video.src = url
      document.body.appendChild(video)
    })
  }

  async function handleStoryUpload(files: FileList | null) {
    if (!files || files.length === 0 || !editingGallery || !businessSlug) return
    const file = files[0]
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      alert('יש להעלות קובץ MP4 בלבד.')
      return
    }
    if (file.size > STORY_MAX_BYTES) {
      alert(`הקובץ גדול מדי. המקסימום הוא ${Math.round(STORY_MAX_BYTES / 1024 / 1024)}MB.`)
      return
    }

    setStoryUploading(true)
    setStoryUploadProgress({ pct: 0, filename: file.name })

    // Best-effort duration probe. Failure here doesn't block the upload —
    // the column is nullable, and the public viewer falls back to a fixed
    // duration when it's null.
    const duration = await readVideoDurationSeconds(file)

    // Encode the timestamp so two manual uploads in the same gallery don't
    // overwrite each other. Desktop-generated paths use the style name
    // verbatim ("story_minimal.mp4"); manual ones get a unique suffix.
    const stamp = Date.now().toString(36)
    const styleTag = `manual-${stamp}`
    const storagePath = `${businessSlug}/${editingGallery.id}/story_${styleTag}.mp4`

    setStoryUploadProgress({ pct: 30, filename: file.name })
    const { error: uploadErr } = await supabase.storage
      .from(STORY_BUCKET)
      // 1-year cache: story files are content-addressed, safe to cache long.
      .upload(storagePath, file, { contentType: 'video/mp4', upsert: true, cacheControl: '31536000' })
    if (uploadErr) {
      setStoryUploading(false)
      setStoryUploadProgress(null)
      alert('שגיאה בהעלאה: ' + uploadErr.message)
      return
    }

    setStoryUploadProgress({ pct: 80, filename: file.name })
    const { data: inserted, error: insertErr } = await supabase
      .from('stories')
      .insert({
        gallery_id: editingGallery.id,
        style: 'manual',
        storage_path: storagePath,
        duration,
      })
      .select('id, style, storage_path, duration, created_at')
      .single()

    if (insertErr || !inserted) {
      // Clean up the orphaned object so a retry doesn't pile up storage.
      await supabase.storage.from(STORY_BUCKET).remove([storagePath])
      setStoryUploading(false)
      setStoryUploadProgress(null)
      alert('שגיאה בשמירת הסטורי: ' + (insertErr?.message ?? 'unknown'))
      return
    }

    setStories(prev => [...prev, inserted])
    setStoryUploadProgress({ pct: 100, filename: file.name })
    setStoryUploading(false)
    // Tiny delay so guests see the 100% bar before it disappears.
    setTimeout(() => setStoryUploadProgress(null), 600)
    if (storyFileInputRef.current) storyFileInputRef.current.value = ''
  }

  async function handleStoryDelete(storyId: string) {
    const story = stories.find(s => s.id === storyId)
    if (!story) return

    // Optimistic removal — matches the photo-delete pattern used elsewhere
    // in the editor. We snapshot the previous state so we can roll back on
    // failure rather than leaving the UI lying to the photographer.
    const previous = stories
    setStories(prev => prev.filter(s => s.id !== storyId))
    setStoryMenuOpenId(null)
    setConfirmDeleteStoryId(null)

    // Delete the storage object first, then the row — same ordering as the
    // gallery-delete pipeline in cloudUpload.ts. If the object remove fails
    // we still try the row so the editor doesn't strand a ghost record.
    if (story.storage_path) {
      const { error: rmErr } = await supabase.storage
        .from(STORY_BUCKET)
        .remove([story.storage_path])
      if (rmErr) console.warn('[story-delete] storage remove failed', rmErr)
    }

    const { error: dbErr } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)

    if (dbErr) {
      // Roll back the optimistic update so the photographer can retry.
      setStories(previous)
      alert('שגיאה במחיקה: ' + dbErr.message)
    }
  }

  async function updateGallerySetting(key: string, value: unknown) {
    if (!editingGallery) return
    const settings = { ...(editingGallery.delivery_settings || {}), [key]: value }
    await supabase.from('galleries').update({ delivery_settings: settings }).eq('id', editingGallery.id)
    setEditingGallery({ ...editingGallery, delivery_settings: settings })
  }

  // ── Custom domain helpers ──────────────────────────────────────────────────
  // submitCustomDomain wires the input -> set_business_custom_domain RPC.
  // The RPC validates everything (format, plan, uniqueness, reserved
  // pixflow-ai.com) and returns either { ok: true, domain, verification_token,
  // dns_record } or { ok: false, error }. We translate the error code to a
  // Hebrew message so the photographer doesn't see a raw token.
  async function submitCustomDomain() {
    const candidate = domainInput.trim().toLowerCase()
    if (!candidate) {
      setDomainError('יש להזין דומיין')
      return
    }
    setDomainSaving(true)
    setDomainError(null)
    try {
      const { data, error } = await supabase.rpc('set_business_custom_domain', { p_domain: candidate })
      if (error) {
        setDomainError('שגיאה בשמירה — נסו שוב')
        return
      }
      const result = data as {
        ok: boolean
        domain?: string
        verification_token?: string
        dns_record?: { type: string; name: string; value: string }
        error?: string
      } | null
      if (!result?.ok) {
        setDomainError(domainErrorToHebrew(result?.error))
        return
      }
      setCustomDomain(result.domain ?? candidate)
      setCustomDomainToken(result.verification_token ?? null)
      setCustomDomainStatus('pending_dns')
      setDomainInput('')
    } finally {
      setDomainSaving(false)
    }
  }

  // Stub: PR 3b will call a server-side DNS lookup. For the foundation PR we
  // just re-fetch the businesses row so the UI reflects whatever state is
  // already in the DB (in case the photographer has multiple tabs open).
  async function recheckCustomDomain() {
    if (!businessId) return
    const { data } = await supabase
      .from('businesses')
      .select('custom_domain, custom_domain_status, custom_domain_verification_token')
      .eq('id', businessId)
      .maybeSingle()
    const row = data as {
      custom_domain?: string | null
      custom_domain_status?: 'unverified' | 'pending_dns' | 'verified' | 'error' | null
      custom_domain_verification_token?: string | null
    } | null
    if (row) {
      setCustomDomain(row.custom_domain ?? null)
      setCustomDomainStatus((row.custom_domain_status as 'unverified' | 'pending_dns' | 'verified' | 'error') ?? 'unverified')
      setCustomDomainToken(row.custom_domain_verification_token ?? null)
    }
  }

  // Clears the photographer's custom domain. Direct UPDATE (not via RPC) is
  // safe because the businesses_owner_update policy restricts the row to its
  // owner. We null out everything so the unique index frees up the value.
  async function removeCustomDomain() {
    if (!businessId) return
    setDomainSaving(true)
    try {
      await supabase
        .from('businesses')
        .update({
          custom_domain: null,
          custom_domain_status: 'unverified',
          custom_domain_verification_token: null,
          custom_domain_added_at: null,
          custom_domain_verified_at: null,
        })
        .eq('id', businessId)
      setCustomDomain(null)
      setCustomDomainStatus('unverified')
      setCustomDomainToken(null)
      setDomainError(null)
    } finally {
      setDomainSaving(false)
    }
  }

  function domainErrorToHebrew(code: string | undefined): string {
    switch (code) {
      case 'invalid_format':    return 'פורמט דומיין לא תקין — לדוגמה: photos.studio-shem.co.il'
      case 'reserved_domain':   return 'לא ניתן להשתמש בדומיין זה'
      case 'plan_not_eligible': return 'דומיין מותאם זמין רק בתכנית עסקית'
      case 'domain_taken':      return 'דומיין זה כבר בשימוש'
      case 'empty_domain':      return 'יש להזין דומיין'
      case 'no_business':       return 'לא נמצא חשבון עסקי'
      case 'not_authenticated': return 'יש להתחבר מחדש'
      default:                  return 'שגיאה לא צפויה — נסו שוב'
    }
  }

  async function publishGallery() {
    if (!editingGallery) return
    await supabase.from('galleries').update({ status: 'live', published_at: new Date().toISOString() }).eq('id', editingGallery.id)
    setEditingGallery({ ...editingGallery, status: 'live', published_at: new Date().toISOString() })

    // Kick off face indexing if the photographer enabled it. Without this,
    // FaceFinder is a dead button on web-published galleries — the desktop
    // app calls this same edge action automatically; we matched the behaviour.
    // Best-effort: failure here doesn't fail the publish, and the action is
    // safely re-runnable on the next publish or from the desktop.
    const settings = editingGallery.delivery_settings as { faceIndexEnabled?: boolean } | null
    if (settings?.faceIndexEnabled) {
      void supabase.functions.invoke('rekognition', {
        body: { action: 'index_gallery', galleryId: editingGallery.id },
      }).catch(err => console.warn('[face-index]', err))
    }

    fetchGalleries()
  }

  const [copiedGalleryId, setCopiedGalleryId] = useState<string | null>(null)
  const [shareGallery, setShareGallery] = useState<Gallery | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareSubject, setShareSubject] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [shareSending, setShareSending] = useState(false)
  const [shareSent, setShareSent] = useState(false)

  function openEmailShare(g: Gallery) {
    setShareGallery(g)
    setShareSubject(`התמונות שלך מ-${g.name} מוכנות`)
    setShareMessage('')
    setShareEmail('')
    setShareSent(false)
  }

  // Focus traps — one per modal. Each is wired to escape-to-close so
  // keyboard users can dismiss the modal exactly the way mouse users do.
  const galleryEditorRef = useFocusTrap<HTMLDivElement>(!!editingGallery, () => setEditingGallery(null))
  const addSetRef        = useFocusTrap<HTMLDivElement>(showAddSetModal, () => setShowAddSetModal(false))
  const newGalleryRef    = useFocusTrap<HTMLDivElement>(showModal, () => setShowModal(false))
  const faceConfirmRef   = useFocusTrap<HTMLDivElement>(showFaceConfirm, () => setShowFaceConfirm(false))
  const shareModalRef    = useFocusTrap<HTMLDivElement>(!!shareGallery, () => { if (!shareSending) setShareGallery(null) })
  const buyTokensRef     = useFocusTrap<HTMLDivElement>(showBuyTokens, () => setShowBuyTokens(false))

  async function sendShareEmail() {
    if (!shareGallery || !shareEmail) return
    setShareSending(true)
    try {
      const { sendGalleryShareEmail } = await import('../lib/shareGallery')
      const res = await sendGalleryShareEmail({
        galleryId: shareGallery.id,
        recipientEmail: shareEmail,
        subject: shareSubject || undefined,
        message: shareMessage || undefined,
      })
      if (res.ok) {
        setShareSent(true)
        setTimeout(() => { setShareGallery(null); setShareSent(false) }, 1800)
      } else {
        alert('שגיאה בשליחה: ' + (res.error || 'לא ידוע'))
      }
    } catch (err) {
      alert('שגיאה: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setShareSending(false)
    }
  }

  function copyGalleryLink(galleryId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/gallery/${galleryId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGalleryId(galleryId)
      setTimeout(() => setCopiedGalleryId(prev => prev === galleryId ? null : prev), 1800)
    })
  }

  const imgUrl = (path: string) => storageUrl('gallery-images', path)

  // ─── Bulk actions (selectMode) ───────────────────────────────────────────
  function exitSelectMode() {
    setSelectMode(false)
    setSelectedImageIds(new Set())
  }
  async function bulkDeleteSelected() {
    if (!editingGallery || selectedImageIds.size === 0) return
    const count = selectedImageIds.size
    if (!confirm(`למחוק ${count} תמונות? פעולה זו לא ניתנת לביטול.`)) return
    const ids = Array.from(selectedImageIds)
    const { error } = await supabase.from('images').delete().in('id', ids)
    if (error) {
      alert('שגיאה במחיקה: ' + error.message)
      return
    }
    setGalleryImages(prev => prev.filter(i => !selectedImageIds.has(i.id)))
    await supabase.from('galleries')
      .update({ image_count: Math.max(0, galleryImages.length - ids.length) })
      .eq('id', editingGallery.id)
    fetchGalleries()
    exitSelectMode()
  }
  async function bulkToggleTopPick(makeTopPick: boolean) {
    if (!editingGallery || selectedImageIds.size === 0) return
    const ids = Array.from(selectedImageIds)
    const { error } = await supabase.from('images').update({ is_top_pick: makeTopPick }).in('id', ids)
    if (error) {
      alert('שגיאה: ' + error.message)
      return
    }
    setGalleryImages(prev => prev.map(i => selectedImageIds.has(i.id) ? { ...i, is_top_pick: makeTopPick } : i))
    exitSelectMode()
  }
  function selectAllImages() {
    setSelectedImageIds(new Set(galleryImages.map(i => i.id)))
  }

  // Single-image actions — invoked from the per-tile hover overlay so the
  // photographer can star, move, or delete one photo without entering
  // select mode. Each updates the local galleryImages state optimistically.
  async function toggleSingleTopPick(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img) return
    const next = !img.is_top_pick
    const { error } = await supabase.from('images').update({ is_top_pick: next }).eq('id', imageId)
    if (error) { alert('שגיאה: ' + error.message); return }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, is_top_pick: next } : i))
  }
  async function moveImageToSection(imageId: string, sectionId: string | null) {
    const { error } = await supabase.from('images').update({ section_id: sectionId }).eq('id', imageId)
    if (error) { alert('שגיאה: ' + error.message); return }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, section_id: sectionId } : i))
  }
  async function deleteSingleImage(imageId: string) {
    if (!editingGallery) return
    if (!confirm('למחוק את התמונה? פעולה זו לא ניתנת לביטול.')) return
    const { error } = await supabase.from('images').delete().eq('id', imageId)
    if (error) { alert('שגיאה במחיקה: ' + error.message); return }
    setGalleryImages(prev => prev.filter(i => i.id !== imageId))
    await supabase.from('galleries')
      .update({ image_count: Math.max(0, galleryImages.length - 1) })
      .eq('id', editingGallery.id)
    fetchGalleries()
  }
  // Phase 4.3 canary: this is the first call site that goes through the
  // signed-URL helper instead of the public URL. Today the bucket is still
  // public, so signed URLs work just like public URLs do; the helper also
  // falls back to the public URL on any failure (network, server, missing
  // env). Once we have weeks of clean telemetry on this single surface we
  // can roll the same swap out to the rest of Dashboard / FeedStudio /
  // CreativeRenderer (Phase 4.4) and finally App.tsx (Phase 4.5).
  async function downloadOriginal(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img) return
    const url = await signedStorageUrl('gallery-images', img.storage_path)
    const a = document.createElement('a')
    a.href = url; a.download = img.filename || 'photo.jpg'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // Reorder helper. Operates on the *visible* list (the active section's
  // images, sorted by sort_order). Used by both the drag-and-drop handler
  // and the keyboard "Move up / Move down" menu items so visual users and
  // keyboard users get the exact same behavior. Renumbers every visible
  // image with a 1000-step gap so subsequent moves don't collide.
  async function reorderImage(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const visible = (activeSectionId
      ? galleryImages.filter(i => i.section_id === activeSectionId)
      : galleryImages
    ).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const fromIdx = visible.findIndex(i => i.id === draggedId)
    const toIdx = visible.findIndex(i => i.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = visible.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const idToOrder = new Map<string, number>()
    next.forEach((img, idx) => { idToOrder.set(img.id, idx * 1000) })
    setGalleryImages(prev => prev.map(i =>
      idToOrder.has(i.id) ? { ...i, sort_order: idToOrder.get(i.id)! } : i
    ))
    await Promise.all(next.map((img, idx) =>
      supabase.from('images').update({ sort_order: idx * 1000 }).eq('id', img.id)
    ))
  }
  // Keyboard alternative for drag-reorder. Moves the image one step up
  // or down within the visible list. Wired into the per-tile "..." menu
  // so screen reader / keyboard users get the same control as mouse users.
  async function moveImageStep(imageId: string, direction: 'up' | 'down') {
    const visible = (activeSectionId
      ? galleryImages.filter(i => i.section_id === activeSectionId)
      : galleryImages
    ).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const idx = visible.findIndex(i => i.id === imageId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= visible.length) return
    await reorderImage(imageId, visible[targetIdx].id)
  }

  /* ---------- Loading state ---------- */
  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: `3px solid ${border}`, borderTopColor: accent,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ color: textSecondary, fontSize: 14, fontFamily: 'inherit', letterSpacing: '0.02em' }}>Loading...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  /* ---------- Sign-in screen ---------- */
  if (!user) {
    return (
      <div style={{
        background: `radial-gradient(ellipse at 50% 0%, rgba(45,196,121,.08) 0%, ${bg} 60%)`,
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit', direction: 'rtl',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 440, padding: 48,
          animation: 'fadeInUp .5s ease both',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto 24px',
            background: `linear-gradient(135deg, ${accent}, #a78bfa)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, boxShadow: `0 8px 32px ${accentGlow}`,
          }}>
            📸
          </div>
          <h1 style={{ color: textPrimary, fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
            ברוכים הבאים ל-Pixflow
          </h1>
          <p style={{ color: textSecondary, fontSize: 16, marginBottom: 40, lineHeight: 1.7 }}>
            התחברו כדי לנהל את הגלריות שלכם
          </p>
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              background: '#fff', color: '#1a1a2e', border: 'none', borderRadius: 14,
              padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'transform .15s, box-shadow .15s',
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.3)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.08 24.08 0 000 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            התחברות עם Google
          </button>
        </div>
      </div>
    )
  }

  /* ---------- Dashboard (authenticated) ---------- */
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email

  const totalPhotos = galleries.reduce((sum, g) => sum + (g.image_count ?? 0), 0)
  // "Live" matches both 'published' (web) and 'live' (desktop) statuses.
  // Without including 'live', desktop-published galleries are counted as
  // drafts in the stats row even though their cards say PUBLISHED.
  const publishedCount = galleries.filter((g) => g.status === 'published' || g.status === 'live').length
  const draftCount = galleries.length - publishedCount

  const statCards: { label: string; value: number | string; icon: IconName; color: string }[] = [
    { label: 'Galleries',  value: galleries.length, icon: 'gallery', color: textPrimary },
    { label: 'Photos',     value: totalPhotos,      icon: 'photo',   color: textPrimary },
    { label: 'Published',  value: publishedCount,   icon: 'check',   color: textPrimary },
    { label: 'Drafts',     value: draftCount,       icon: 'duplicate', color: textPrimary },
  ]

  return (
    <div className="dash" style={{
      background: bg, minHeight: '100vh', fontFamily: 'inherit',
      direction: 'rtl', color: textPrimary,
      display: 'flex',
    }}>
      {/* ======= Sidebar ======= */}
      {/* Mobile backdrop — visible only when the drawer is open under 900px */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 199,
            background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)',
            display: 'none',
          }}
          className="dash-sidebar-backdrop"
        />
      )}

      <aside
        className={`dash-sidebar ${sidebarOpen ? 'dash-sidebar--open' : ''}`}
        style={{
          width: 240, flexShrink: 0,
          background: bg,
          borderInlineStart: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
          padding: '28px 20px',
          position: 'sticky', top: 0, height: '100vh',
          zIndex: 200,
        }}
      >
        {/* Mobile close X — visible only via .dash-hamburger media query */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="dash-hamburger"
          aria-label="Close menu"
          style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            position: 'absolute', top: 14, left: 14,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0,0,0,.03)',
            border: `1px solid ${border}`,
            color: textPrimary, cursor: 'pointer', padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Logo — editorial wordmark, no gradient block */}
        <a href="/" style={{
          display: 'flex', alignItems: 'baseline', gap: 4,
          padding: '4px 6px 32px',
          textDecoration: 'none', color: textPrimary,
          fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em',
        }}>
          <span>Pixflow</span>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: textPrimary, marginInlineStart: 4,
            transform: 'translateY(-1px)',
          }} />
        </a>

        {/* Nav — eyebrow above gives the sidebar a clear editorial section
            label and improves scannability for first-time users. */}
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
          padding: '0 12px 12px',
        }}>
          Workspace
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {[
            { icon: 'gallery' as IconName, label: 'הגלריות שלי', active: true, disabled: false },
            { icon: 'palette' as IconName,  label: 'מיתוג',       active: false, disabled: true },
            { icon: 'clients' as IconName,  label: 'לקוחות',      active: false, disabled: true },
            { icon: 'help' as IconName,     label: 'עזרה',        active: false, disabled: false },
          ].map(item => (
            <button key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 12px', borderRadius: 4,
              background: 'transparent',
              border: 'none',
              color: item.active ? textPrimary : (item.disabled ? textMuted : textSecondary),
              fontSize: 13, fontWeight: item.active ? 600 : 400,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', textAlign: 'right' as const,
              opacity: item.disabled ? 0.55 : 1,
              transition: 'color .15s',
              position: 'relative',
            }}>
              {item.active && (
                <span style={{
                  position: 'absolute', insetInlineEnd: -20, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 2, height: 18,
                  background: textPrimary,
                }} />
              )}
              <Icon name={item.icon} size={16} strokeWidth={1.6} style={{ opacity: item.active ? 1 : 0.7 }} />
              <span>{item.label}</span>
              {item.disabled && (
                <span style={{
                  marginInlineStart: 'auto', fontSize: 9, fontWeight: 500,
                  padding: '3px 7px', borderRadius: 0,
                  background: 'transparent', color: textMuted,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  border: `1px solid ${border}`,
                }}>Soon</span>
              )}
            </button>
          ))}
        </nav>

        {/* Account section — eyebrow + token balance card. Mirrors the
            Workspace eyebrow above for visual rhythm; together they give
            the sidebar two clear sections. */}
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
          padding: '20px 12px 12px',
        }}>
          Account
        </div>
        {(() => {
          const low = tokenBalance < 50
          return (
            <button
              onClick={() => setShowBuyTokens(true)}
              style={{
                background: bgSubtle,
                border: `1px solid ${border}`,
                borderRadius: 4, padding: '16px 18px',
                cursor: 'pointer', fontFamily: 'inherit',
                color: textPrimary, textAlign: 'right' as const,
                transition: 'border-color .2s, background .2s',
                marginBottom: 16,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
            >
              <div style={{
                fontSize: 10, color: textMuted, marginBottom: 8,
                fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <span>Tokens</span>
                {low && <span style={{ color: '#A67C52', letterSpacing: '0.14em' }}>Low</span>}
              </div>
              <div style={{
                fontSize: 26, fontWeight: 500, color: textPrimary,
                marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {tokenBalance.toLocaleString('he-IL')}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 500, color: textSecondary,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 6,
                paddingTop: 10, borderTop: `1px solid ${border}`,
              }}>
                Buy more
                <span style={{ marginInlineStart: 'auto' }}>→</span>
              </div>
            </button>
          )
        })()}

        {/* Profile + logout */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 8px', borderTop: `1px solid ${border}`,
          marginInline: -6, paddingInline: 14,
        }}>
          {avatar && (
            <img src={avatar} alt="" style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `1.5px solid ${border}`,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: textPrimary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <button onClick={signOut} style={{
              background: 'none', border: 'none', padding: 0, marginTop: 2,
              fontSize: 10, color: '#fca5a5', fontFamily: 'inherit',
              cursor: 'pointer', letterSpacing: '.04em',
            }}>התנתקות ↩</button>
          </div>
        </div>
      </aside>

      {/* ======= Right column ======= */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* Mobile-only hamburger floating top-right */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="dash-hamburger"
        aria-label="Open menu"
        style={{
          display: 'none', alignItems: 'center', justifyContent: 'center',
          position: 'fixed', top: 16, insetInlineStart: 16, zIndex: 50,
          width: 40, height: 40, borderRadius: 10,
          background: '#fff',
          border: `1px solid ${border}`,
          color: textPrimary, cursor: 'pointer', padding: 0,
          boxShadow: '0 2px 8px rgba(15,23,42,.08)',
        }}
      >
        <Icon name="menu" size={18} strokeWidth={2} />
      </button>

      {/* ======= Main content ======= */}
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 40px 96px' }}>

        {/* Page heading + CTA — Pic-Time editorial rhythm: tracked uppercase
            eyebrow, semi-bold display title, outlined-black CTA on cream that
            inverts to filled black on hover. No brand color in primary action. */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: 36, animation: 'fadeInUp .4s ease both',
          gap: 20, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
              color: textMuted, textTransform: 'uppercase', marginBottom: 14,
            }}>
              Workspace
            </div>
            {/* Fluid display heading — scales smoothly between mobile and
                desktop without breakpoint jumps. clamp(min, preferred, max). */}
            <h1 style={{
              fontSize: 'clamp(28px, 4vw, 56px)',
              fontWeight: 500, margin: 0,
              letterSpacing: '-0.025em', lineHeight: 1.02, color: textPrimary,
            }}>
              הגלריות שלי
            </h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: 'transparent',
              color: textPrimary,
              border: `1px solid ${textPrimary}`,
              borderRadius: 2,
              padding: '13px 26px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background .2s, color .2s',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 10,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
          >
            New Gallery
            <Icon name="plus" size={13} strokeWidth={2} />
          </button>
        </div>

        {/* ======= Stats row — editorial: hairline borders, tracked uppercase
              labels, large display number, monochrome treatment. ======= */}
        {!loadingGalleries && galleries.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 0, marginBottom: 56,
            animation: 'fadeInUp .45s ease both',
            border: `1px solid ${border}`,
            background: bgSubtle,
          }}>
            {statCards.map((s, i) => (
              <div key={i} style={{
                padding: '28px 28px',
                borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                position: 'relative',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                  fontSize: 10, color: textMuted,
                  fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>
                  <Icon name={s.icon} size={12} strokeWidth={1.6} />
                  <span>{s.label}</span>
                </div>
                <div style={{
                  fontSize: 26, fontWeight: 400,
                  letterSpacing: '-0.025em', color: textPrimary, lineHeight: 1,
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}>
                  {(typeof s.value === 'number' ? s.value : Number(s.value) || 0).toLocaleString('he-IL')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ======= Content ======= */}
        {loadingGalleries ? (
          /* skeleton loader */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20,
          }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                background: cardSolid, borderRadius: 18, padding: 28,
                border: `1px solid ${border}`, height: 160,
              }}>
                <div style={{
                  width: '60%', height: 16, borderRadius: 8,
                  background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
                  backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
                  marginBottom: 16,
                }} />
                <div style={{
                  width: '40%', height: 12, borderRadius: 6,
                  background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
                  backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
                }} />
              </div>
            ))}
          </div>
        ) : galleries.length === 0 ? (
          /* ======= Empty state — Pic-Time editorial onboarding =======
              Quiet hero: tracked uppercase eyebrow, semi-bold display title,
              two outlined CTAs, three hairline-bordered feature tiles. */
          <div style={{
            textAlign: 'center', padding: '40px 24px 100px',
            animation: 'fadeInUp .5s ease both',
            position: 'relative',
          }}>
            <div style={{
              maxWidth: 720, margin: '0 auto 56px',
              padding: '64px 32px 56px',
              background: bgSubtle,
              border: `1px solid ${border}`,
              borderRadius: 2,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase', marginBottom: 18,
              }}>
                Welcome
              </div>
              <h2 style={{
                fontSize: 38, fontWeight: 500, marginBottom: 18, color: textPrimary,
                letterSpacing: '-0.02em', lineHeight: 1.05,
              }}>
                ברוך הבא ל-Pixflow
              </h2>
              <p style={{
                color: textSecondary, fontSize: 16, marginBottom: 14, lineHeight: 1.65,
                maxWidth: 480, marginInline: 'auto',
              }}>
                גלריות מהירות, פרטיות ויפות לאירועים. עם זיהוי פנים אופציונלי שמאפשר לאורחים למצוא את עצמם בסלפי.
              </p>
              <p style={{
                color: textMuted, fontSize: 11, marginBottom: 36,
                fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                100 free tokens · 100 photos
              </p>
              <div style={{
                display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    background: textPrimary, color: '#fff',
                    border: `1px solid ${textPrimary}`, borderRadius: 2,
                    padding: '14px 28px', fontSize: 12,
                    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background .2s',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#000' }}
                  onMouseLeave={e => { e.currentTarget.style.background = textPrimary }}
                >
                  Create first gallery
                  <Icon name="plus" size={13} strokeWidth={2} />
                </button>
                <a
                  href="/demo"
                  target="_blank"
                  rel="noopener"
                  style={{
                    textDecoration: 'none',
                    background: 'transparent', color: textPrimary,
                    border: `1px solid ${textPrimary}`, borderRadius: 2,
                    padding: '14px 28px', fontSize: 12,
                    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background .2s, color .2s',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                >
                  Try demo
                  <Icon name="arrow-out" size={13} strokeWidth={2} />
                </a>
              </div>
            </div>

            {/* Feature highlights — three column hairline grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 0, maxWidth: 720, margin: '0 auto',
              border: `1px solid ${border}`,
              background: card,
            }}>
              {[
                { icon: 'bolt' as IconName,        title: 'מהיר במיוחד', desc: 'שלוש שכבות איכות לכל תמונה — גלריות נטענות מהר אצל הלקוח, לא משנה כמה תמונות' },
                { icon: 'shield' as IconName,      title: 'פרטי ובטוח',   desc: 'הגנת סיסמה אמיתית בצד השרת — לא מסך שעוקפים בדפדפן' },
                { icon: 'face-search' as IconName, title: 'זיהוי פנים',   desc: 'אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד' },
              ].map((f, i) => (
                <div key={f.title} style={{
                  padding: '32px 28px', textAlign: 'right' as const,
                  borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                }}>
                  <div style={{
                    color: textPrimary, marginBottom: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  }}>
                    <Icon name={f.icon} size={20} strokeWidth={1.4} />
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: textMuted, marginBottom: 8,
                  }}>
                    Feature
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 500, color: textPrimary,
                    marginBottom: 8, letterSpacing: '-0.01em',
                  }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ======= Gallery grid ======= */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 32,
          }}>
            {galleries.map((g, idx) => {
              const isHovered = hoveredCard === g.id
              const isLive = g.status === 'live' || g.status === 'published'
              const explicitCover = ((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined) || null
              const cover = explicitCover || coverFallback[g.id] || null
              return (
                <div
                  key={g.id}
                  style={{
                    background: card,
                    borderRadius: 4,
                    cursor: 'pointer',
                    // Editorial reveal: slower duration + 60ms cascade per
                    // tile, with cubic-bezier(.2,.7,.2,1) for the gentle
                    // "settle" easing favoured by magazine layouts.
                    animation: 'fadeInUp .55s cubic-bezier(.2,.7,.2,1) both',
                    animationDelay: `${Math.min(idx, 12) * 0.06}s`,
                    transition: 'transform .35s cubic-bezier(.2,.7,.2,1)',
                    transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                  }}
                  onClick={() => openGalleryEditor(g)}
                  onMouseEnter={() => setHoveredCard(g.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* Cover image — hero. Editorial: no rounded corners, neutral
                      shadow, subtle scale on hover, soft inner border. */}
                  <div style={{
                    aspectRatio: '4 / 3', borderRadius: 2, overflow: 'hidden',
                    background: cover ? bgSubtle : `linear-gradient(135deg, ${bgSubtle}, ${border})`,
                    position: 'relative',
                    boxShadow: isHovered
                      ? '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.08)'
                      : '0 1px 2px rgba(0,0,0,.04), 0 6px 18px rgba(0,0,0,.04)',
                    transition: 'box-shadow .25s ease',
                  }}>
                    {cover && (
                      <img
                        src={cover}
                        alt=""
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                          transition: 'transform .6s cubic-bezier(.2,.7,.2,1)',
                        }}
                      />
                    )}
                    {!cover && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: textMuted,
                      }}>
                        <Icon name="photo" size={36} strokeWidth={1.2} />
                      </div>
                    )}
                    {/* Hover action row — only on live galleries */}
                    {isLive && isHovered && (
                      <div style={{
                        position: 'absolute', bottom: 12, insetInlineStart: 12,
                        display: 'flex', gap: 6,
                      }}>
                        <button
                          onClick={(e) => copyGalleryLink(g.id, e)}
                          title="העתק קישור"
                          aria-label={copiedGalleryId === g.id ? 'הקישור הועתק' : 'העתק קישור'}
                          style={{
                            width: 34, height: 34, borderRadius: 2,
                            background: 'rgba(255,255,255,.96)',
                            border: `1px solid rgba(20,20,19,.08)`,
                            color: textPrimary, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                          }}
                        >
                          <Icon name={copiedGalleryId === g.id ? 'check' : 'copy'} size={14} strokeWidth={1.85} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEmailShare(g) }}
                          title="שלח במייל ללקוח"
                          aria-label="שלח במייל ללקוח"
                          style={{
                            width: 34, height: 34, borderRadius: 2,
                            background: 'rgba(255,255,255,.96)',
                            border: `1px solid rgba(20,20,19,.08)`,
                            color: textPrimary, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                          }}
                        >
                          <Icon name="mail" size={14} strokeWidth={1.85} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card body — editorial: tracked uppercase status above title */}
                  <div style={{ padding: '18px 2px 0' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
                      textTransform: 'uppercase', color: textMuted, marginBottom: 8,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isLive ? statusLive : border,
                      }} />
                      <span>{isLive ? 'Published' : 'Draft'}</span>
                      {g.published_at && (
                        <>
                          <span style={{ color: border, marginInline: 2 }}>·</span>
                          <span>{new Date(g.published_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </>
                      )}
                    </div>
                    <h3 style={{
                      fontSize: 19, fontWeight: 500, margin: '0 0 6px',
                      letterSpacing: '-0.015em', lineHeight: 1.25, color: textPrimary,
                    }}>
                      {g.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: textSecondary, lineHeight: 1.4 }}>
                      <span>{(g.image_count ?? 0).toLocaleString('he-IL')} תמונות</span>
                    </div>
                    {/* Engagement strip — only when there's signal */}
                    {isLive && ((g.download_count ?? 0) > 0 || (g.favorite_count ?? 0) > 0) && (
                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: textMuted, marginTop: 8 }}>
                        {(g.download_count ?? 0) > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Icon name="download" size={12} strokeWidth={1.85} />
                            {(g.download_count ?? 0).toLocaleString('he-IL')}
                          </span>
                        )}
                        {(g.favorite_count ?? 0) > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Icon name="heart" size={12} strokeWidth={1.85} />
                            {(g.favorite_count ?? 0).toLocaleString('he-IL')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ======= Gallery Editor Modal ======= */}
        {editingGallery && (() => {
          const editorCover = ((editingGallery.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined)
            || coverFallback[editingGallery.id]
            || null
          const isLiveStatus = editingGallery.status === 'live' || editingGallery.status === 'published'
          return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'stretch', justifyContent: 'center',
            animation: 'overlayIn .2s ease both',
          }} onClick={() => setEditingGallery(null)}>
            <div
              ref={galleryEditorRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="gallery-editor-heading"
              style={{
                background: bg,
                width: 'calc(100vw - 32px)', maxWidth: 1440,
                height: 'calc(100vh - 32px)', maxHeight: 920,
                margin: '16px',
                borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                border: `1px solid ${border}`, animation: 'modalIn .3s ease both',
              }} onClick={e => e.stopPropagation()}>
              {/* Editor header — name + status pill on the right (RTL),
                  Preview + Share/Publish on the left. Mirrors Pixieset's
                  rhythm exactly. */}
              <div style={{
                padding: '18px 32px', borderBottom: `1px solid ${border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: bgSubtle,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={() => setEditingGallery(null)} aria-label="חזרה" style={{
                    background: 'none', border: 'none', color: textSecondary, cursor: 'pointer',
                    padding: 4, display: 'flex', alignItems: 'center',
                  }}>
                    <Icon name="close" size={18} strokeWidth={1.85} />
                  </button>
                  <div>
                    <h2 id="gallery-editor-heading" style={{ fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: '-0.015em', color: textPrimary }}>
                      {editingGallery.name}
                    </h2>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                      fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
                      textTransform: 'uppercase', color: textMuted,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isLiveStatus ? statusLive : border,
                      }} />
                      <span>{isLiveStatus ? 'Published' : 'Draft'}</span>
                      <span style={{ color: border, marginInline: 2 }}>·</span>
                      <span>{galleryImages.length} תמונות</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <a href={`/gallery/${editingGallery.id}`} target="_blank" style={{
                    padding: '10px 18px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                    background: 'transparent', border: `1px solid ${border}`, color: textPrimary,
                    textDecoration: 'none', fontFamily: 'inherit',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                    <Icon name="arrow-out" size={13} strokeWidth={1.85} />
                    Preview
                  </a>
                  {editingGallery.status !== 'live' && (
                    <button onClick={publishGallery} style={{
                      padding: '10px 22px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                      background: textPrimary, border: `1px solid ${textPrimary}`,
                      color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                    }}>Publish</button>
                  )}
                </div>
              </div>

              {/* Editor body — split layout. Sidebar holds cover preview +
                  vertical icon tabs (mirrors Pixieset). Main area holds the
                  active tab's content. RTL flow keeps the sidebar visually
                  on the right side of the modal — natural for Hebrew users. */}
              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {/* ── Sidebar ─────────────────────────────────── */}
                <aside style={{
                  width: 260, flexShrink: 0,
                  borderInlineStart: `1px solid ${border}`,
                  background: bg,
                  display: 'flex', flexDirection: 'column',
                  overflowY: 'auto',
                }}>
                  {/* Cover preview — full-bleed thumbnail at top of sidebar */}
                  <div style={{
                    aspectRatio: '4 / 3', width: '100%', overflow: 'hidden',
                    background: editorCover ? bgSubtle : `linear-gradient(135deg, ${bgSubtle}, ${border})`,
                    borderBottom: `1px solid ${border}`,
                    position: 'relative',
                  }}>
                    {editorCover ? (
                      <img src={editorCover} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: textMuted,
                      }}>
                        <Icon name="photo" size={32} strokeWidth={1.2} />
                      </div>
                    )}
                  </div>

                  {/* Vertical icon-tab strip — single row of 5 icons,
                      label appears below the active one only (Pixieset pattern). */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-around',
                    padding: '14px 12px', borderBottom: `1px solid ${border}`,
                  }}>
                    {([
                      { id: 'photos' as const,     icon: 'photo'    as IconName, label: 'תמונות' },
                      { id: 'sections' as const,   icon: 'sections' as IconName, label: 'קטעים' },
                      { id: 'stories' as const,    icon: 'stories'  as IconName, label: 'סטוריז' },
                      { id: 'welcome' as const,    icon: 'palette'  as IconName, label: 'עיצוב' },
                      { id: 'activities' as const, icon: 'activity' as IconName, label: 'פעילות' },
                      { id: 'settings' as const,   icon: 'settings' as IconName, label: 'הגדרות' },
                    ]).map(t => {
                      const active = editTab === t.id
                      return (
                        <button key={t.id} onClick={() => setEditTab(t.id)} aria-label={t.label} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          padding: 8, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 4,
                          color: active ? textPrimary : textMuted,
                          fontFamily: 'inherit',
                          position: 'relative',
                        }}>
                          <Icon name={t.icon} size={18} strokeWidth={active ? 1.85 : 1.5} />
                          {active && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
                              textTransform: 'uppercase', color: textPrimary,
                            }}>{t.label}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Sets eyebrow + list — Pixieset pattern. Shows only for
                      the Photos tab; the other tabs hide it to keep the
                      sidebar focused on their content. */}
                  {editTab === 'photos' && (
                  <div style={{ padding: '20px 18px 12px' }}>
                    <div style={{
                      fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                      color: textMuted, textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 10, paddingInline: 4,
                    }}>
                      <span>Photos</span>
                      <button onClick={() => setShowAddSetModal(true)} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: textPrimary, padding: 0, display: 'inline-flex',
                        alignItems: 'center', gap: 4, fontFamily: 'inherit',
                        fontSize: 9, fontWeight: 500, letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}>
                        <Icon name="plus" size={11} strokeWidth={2} />
                        <span>Add Set</span>
                      </button>
                    </div>

                    {/* "All photos" — pseudo-section that ignores section_id. */}
                    <button onClick={() => setActiveSectionId(null)} style={{
                      width: '100%', textAlign: 'right' as const,
                      padding: '10px 12px', borderRadius: 2,
                      background: activeSectionId === null ? bgSubtle : 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 13,
                      fontWeight: activeSectionId === null ? 600 : 500,
                      color: textPrimary,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'background .15s',
                    }}>
                      <span>כל התמונות</span>
                      <span style={{ color: textMuted, fontSize: 12, fontWeight: 400 }}>
                        {galleryImages.length}
                      </span>
                    </button>

                    {/* Sets — drag handle, name (or rename input), count, "..." menu */}
                    {sections.map(s => {
                      const isActive = activeSectionId === s.id
                      const count = (galleryImages as GalleryImage[]).filter(im => im.section_id === s.id).length
                      const isRenaming = renamingSectionId === s.id
                      const isMenuOpen = sectionMenuOpenId === s.id
                      return (
                        <div key={s.id} style={{
                          position: 'relative',
                          background: isActive ? bgSubtle : 'transparent',
                          transition: 'background .15s',
                        }}>
                          <button onClick={() => { setActiveSectionId(s.id); setSectionMenuOpenId(null) }} style={{
                            width: '100%', textAlign: 'right' as const,
                            padding: '10px 12px', borderRadius: 2,
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 13,
                            fontWeight: isActive ? 600 : 500,
                            color: textPrimary,
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <span aria-hidden="true" style={{
                              opacity: 0.4, color: textMuted,
                              display: 'inline-flex',
                              fontSize: 12, lineHeight: 1,
                            }}>≡</span>
                            {isRenaming ? (
                              <input
                                autoFocus
                                defaultValue={s.name}
                                onBlur={(e) => {
                                  const v = e.target.value.trim()
                                  if (v && v !== s.name) renameSection(s.id, v)
                                  setRenamingSectionId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') setRenamingSectionId(null)
                                }}
                                style={{
                                  flex: 1, minWidth: 0,
                                  border: 'none', background: 'transparent',
                                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                                  color: textPrimary, outline: 'none', padding: 0,
                                }}
                              />
                            ) : (
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.name}
                              </span>
                            )}
                            <span style={{ color: textMuted, fontSize: 12, fontWeight: 400 }}>
                              {count}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); setSectionMenuOpenId(isMenuOpen ? null : s.id) }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault(); e.stopPropagation()
                                  setSectionMenuOpenId(isMenuOpen ? null : s.id)
                                }
                              }}
                              style={{
                                color: textMuted, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 24, height: 24, borderRadius: 2,
                              }}
                              aria-label="עוד"
                            >
                              <Icon name="menu" size={14} strokeWidth={1.85} />
                            </span>
                          </button>
                          {isMenuOpen && (
                            <div style={{
                              position: 'absolute', top: '100%', insetInlineStart: 8,
                              background: cardSolid, border: `1px solid ${border}`,
                              boxShadow: '0 8px 24px rgba(0,0,0,.08)', zIndex: 5,
                              minWidth: 140, padding: 4,
                            }}>
                              <button onClick={() => { setRenamingSectionId(s.id); setSectionMenuOpenId(null) }} style={{
                                width: '100%', textAlign: 'right' as const,
                                padding: '8px 10px', borderRadius: 2,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 12, color: textPrimary,
                              }}>שינוי שם</button>
                              <button onClick={() => { deleteSection(s.id); setSectionMenuOpenId(null) }} style={{
                                width: '100%', textAlign: 'right' as const,
                                padding: '8px 10px', borderRadius: 2,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 12, color: '#dc2626',
                              }}>מחיקה</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )}
                </aside>

                {/* ── Main content pane ──────────────────────────── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', minWidth: 0 }}>

                {/* ── Photos Tab ── */}
                {editTab === 'photos' && (
                  <div
                    onDragOver={e => { e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files) }}
                    style={{ minHeight: '100%' }}
                  >
                    {/* Top strip — section title + Add Media CTA. Drop zone
                        is gone; the entire main pane accepts drag-drop, and
                        clicking Add Media opens the native file picker. */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 24,
                    }}>
                      {(() => {
                        const activeSec = activeSectionId ? sections.find(s => s.id === activeSectionId) : null
                        const visibleImages = activeSectionId
                          ? (galleryImages as GalleryImage[]).filter(im => im.section_id === activeSectionId)
                          : galleryImages
                        return (
                          <h3 style={{
                            fontSize: 22, fontWeight: 500, margin: 0,
                            letterSpacing: '-0.015em', color: textPrimary,
                          }}>
                            {activeSec ? activeSec.name : 'כל התמונות'}
                            <span style={{
                              marginInlineStart: 12, color: textMuted,
                              fontSize: 14, fontWeight: 400,
                            }}>
                              {visibleImages.length}
                            </span>
                          </h3>
                        )
                      })()}
                      <input ref={fileInputRef} type="file" multiple accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => handleFileUpload(e.target.files)} />
                      {/* Right cluster — sort dropdown + grid size toggle + Add Media */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Sort */}
                        <select
                          value={photoSort}
                          onChange={(e) => setPhotoSort(e.target.value as typeof photoSort)}
                          aria-label="מיון תמונות"
                          style={{
                            padding: '8px 12px', borderRadius: 2,
                            border: `1px solid ${border}`,
                            background: '#fff', color: textPrimary,
                            fontSize: 11, fontFamily: 'inherit',
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            cursor: 'pointer', outline: 'none',
                          }}
                        >
                          <option value="order">סדר ידני</option>
                          <option value="name">שם</option>
                          <option value="newest">חדש קודם</option>
                        </select>
                        {/* Grid size toggle */}
                        <div style={{
                          display: 'flex', border: `1px solid ${border}`, borderRadius: 2,
                        }}>
                          {([
                            { id: 'regular' as const, label: 'Regular' },
                            { id: 'large'   as const, label: 'Large' },
                          ]).map(s => (
                            <button
                              key={s.id}
                              onClick={() => setGridSize(s.id)}
                              aria-label={`Grid ${s.label}`}
                              title={s.label}
                              style={{
                                padding: '8px 10px', cursor: 'pointer',
                                background: gridSize === s.id ? textPrimary : '#fff',
                                color: gridSize === s.id ? '#fff' : textPrimary,
                                border: 'none', borderInlineStart: s.id === 'large' ? `1px solid ${border}` : 'none',
                                fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Icon name={s.id === 'regular' ? 'sections' : 'gallery'} size={13} strokeWidth={1.85} />
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          style={{
                            padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                            background: textPrimary, border: `1px solid ${textPrimary}`,
                            color: '#fff', cursor: uploading ? 'wait' : 'pointer',
                            fontFamily: 'inherit', opacity: uploading ? 0.6 : 1,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                          }}
                        >
                          <Icon name="plus" size={13} strokeWidth={2} />
                          Add Media
                        </button>
                      </div>
                    </div>

                    {/* Bulk action toolbar — sticky inline strip */}
                    {selectMode && (
                      <div style={{
                        position: 'sticky', top: 0, zIndex: 10,
                        marginBottom: 16, padding: '10px 16px',
                        background: textPrimary, color: '#fff',
                        display: 'flex', alignItems: 'center', gap: 12,
                        fontSize: 12,
                      }}>
                        <span style={{ fontWeight: 500, letterSpacing: '0.04em' }}>
                          {selectedImageIds.size} {selectedImageIds.size === 1 ? 'תמונה נבחרה' : 'תמונות נבחרו'}
                        </span>
                        <button onClick={selectAllImages} style={{
                          marginInlineStart: 'auto',
                          background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
                          color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
                        }}>בחר הכל</button>
                        <button onClick={() => bulkToggleTopPick(true)} style={{
                          background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
                          color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>★ Pin</button>
                        <button onClick={() => bulkToggleTopPick(false)} style={{
                          background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
                          color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
                        }}>Unpin</button>
                        <button onClick={bulkDeleteSelected} style={{
                          background: '#dc2626', border: `1px solid #dc2626`, borderRadius: 2,
                          color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 500,
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                        }}>Delete</button>
                        <button onClick={exitSelectMode} aria-label="Cancel" style={{
                          background: 'transparent', border: 'none',
                          color: '#fff', padding: '6px 8px', cursor: 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                        }}>
                          <Icon name="close" size={14} strokeWidth={2} />
                        </button>
                      </div>
                    )}

                    {/* Upload progress strip — replaces the old big drop-zone
                        progress UI; sits inline above the grid while active. */}
                    {uploading && uploadBatch && (
                      <div style={{
                        marginBottom: 20, padding: '14px 18px',
                        background: bgSubtle, border: `1px solid ${border}`,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: 12, color: textPrimary, marginBottom: 8,
                          fontWeight: 500, letterSpacing: '0.04em',
                        }}>
                          <span>מעלה {uploadBatch.completed} / {uploadBatch.total}</span>
                          {uploadBatch.failed > 0 && (
                            <span style={{ color: '#A67C52' }}>{uploadBatch.failed} נכשלו</span>
                          )}
                        </div>
                        <div style={{ width: '100%', height: 2, background: border, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.round((uploadBatch.completed / Math.max(1, uploadBatch.total)) * 100)}%`,
                            height: '100%', background: textPrimary,
                            transition: 'width .3s',
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Image grid — tight Pixieset-style packing, no card
                        wrappers, square cells, hover overlay reveals star + menu.
                        Filtered by activeSectionId, sorted per photoSort,
                        cell size driven by gridSize toggle. */}
                    {(() => {
                      let visibleImages = activeSectionId
                        ? (galleryImages as GalleryImage[]).filter(im => im.section_id === activeSectionId)
                        : galleryImages
                      // Sort — operate on a copy so the underlying state stays
                      // in upload-order for any other consumers
                      visibleImages = [...visibleImages].sort((a, b) => {
                        if (photoSort === 'name') return (a.filename || '').localeCompare(b.filename || '')
                        if (photoSort === 'newest') return (b.sort_order ?? 0) - (a.sort_order ?? 0)
                        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
                      })
                      const minCell = gridSize === 'large' ? 220 : 140
                      return visibleImages.length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))`,
                        gap: 4,
                      }}>
                        {visibleImages.map(img => {
                          const isSelected = selectedImageIds.has(img.id)
                          const isHovered = hoveredImageId === img.id
                          const isMenuOpen = imageMenuOpenId === img.id
                          // The hover overlay only appears when not in select
                          // mode — once you're selecting, the click target is
                          // the whole tile and per-tile actions disappear.
                          const showHoverOverlay = isHovered && !selectMode
                          // Drag is only meaningful when sorting manually;
                          // disabling it under name/newest keeps the visible
                          // order in sync with what's persisted.
                          const dragEnabled = photoSort === 'order' && !selectMode
                          const isDragging = draggedImageId === img.id
                          const isDropTarget = dragOverId === img.id && draggedImageId && draggedImageId !== img.id
                          return (
                            <div
                              key={img.id}
                              draggable={dragEnabled}
                              onDragStart={(e) => {
                                if (!dragEnabled) return
                                setDraggedImageId(img.id)
                                e.dataTransfer.effectAllowed = 'move'
                                try { e.dataTransfer.setData('text/plain', img.id) } catch { /* ignore */ }
                              }}
                              onDragOver={(e) => {
                                if (!dragEnabled || !draggedImageId || draggedImageId === img.id) return
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                if (dragOverId !== img.id) setDragOverId(img.id)
                              }}
                              onDragLeave={() => {
                                if (dragOverId === img.id) setDragOverId(null)
                              }}
                              onDrop={(e) => {
                                if (!dragEnabled || !draggedImageId) return
                                e.preventDefault()
                                e.stopPropagation()
                                const src = draggedImageId
                                setDraggedImageId(null); setDragOverId(null)
                                if (src && src !== img.id) reorderImage(src, img.id)
                              }}
                              onDragEnd={() => { setDraggedImageId(null); setDragOverId(null) }}
                              onMouseEnter={() => setHoveredImageId(img.id)}
                              onMouseLeave={() => { setHoveredImageId(null); }}
                              onClick={(e) => {
                                if (selectMode) {
                                  setSelectedImageIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(img.id)) next.delete(img.id); else next.add(img.id)
                                    if (next.size === 0) setSelectMode(false)
                                    return next
                                  })
                                } else {
                                  setSelectMode(true); setSelectedImageIds(new Set([img.id]))
                                }
                                e.stopPropagation()
                              }}
                              style={{
                                position: 'relative', aspectRatio: '1',
                                // overflow:hidden crops the cover image to a square via the
                                // <img>'s object-fit, but it ALSO clips the per-tile menu
                                // popup when it extends past the tile bounds. Switch to
                                // visible while the menu is open so the popup can render
                                // fully — no other content needs the clip.
                                overflow: isMenuOpen ? 'visible' : 'hidden',
                                background: bgSubtle,
                                cursor: dragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                                outline: isSelected
                                  ? `2px solid ${textPrimary}`
                                  : (isDropTarget ? `2px solid ${textPrimary}` : 'none'),
                                outlineOffset: isSelected || isDropTarget ? -2 : 0,
                                opacity: isDragging ? 0.4 : 1,
                                // Lift the menu's tile above its neighbours so the popup
                                // isn't covered by the next tile in the row.
                                zIndex: isMenuOpen ? 10 : 'auto',
                                transition: 'transform .25s cubic-bezier(.2,.7,.2,1), opacity .15s',
                              }}
                            >
                              {/* Leading-edge bar — appears on the drop-target
                                  tile to show where the dragged image will land. */}
                              {isDropTarget && (
                                <div style={{
                                  position: 'absolute', top: 0, bottom: 0,
                                  insetInlineEnd: -2, width: 3,
                                  background: textPrimary, zIndex: 4,
                                  pointerEvents: 'none',
                                }} />
                              )}
                              <SignedImg
                                bucket="gallery-images"
                                path={img.thumbnail_path || img.storage_path}
                                alt="" loading="lazy"
                                style={{
                                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                                  filter: isSelected ? 'brightness(0.55)' : 'none',
                                  transition: 'filter .15s',
                                }}
                              />

                              {/* Star — always shown if pinned, otherwise only on hover.
                                  Click toggles is_top_pick without entering select mode. */}
                              {(img.is_top_pick || showHoverOverlay) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleSingleTopPick(img.id) }}
                                  aria-label={img.is_top_pick ? 'הסר מן המועדפים' : 'הוסף למועדפים'}
                                  style={{
                                    position: 'absolute', top: 8, insetInlineStart: 8,
                                    width: 26, height: 26, borderRadius: '50%',
                                    background: img.is_top_pick ? '#fff' : 'rgba(255,255,255,.85)',
                                    border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: textPrimary, padding: 0,
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24"
                                    fill={img.is_top_pick ? textPrimary : 'none'}
                                    stroke="currentColor" strokeWidth="1.85"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                  </svg>
                                </button>
                              )}

                              {/* Menu trigger — only on hover */}
                              {showHoverOverlay && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setImageMenuOpenId(isMenuOpen ? null : img.id) }}
                                  aria-label="תפריט תמונה"
                                  style={{
                                    position: 'absolute', top: 8, insetInlineEnd: 8,
                                    width: 26, height: 26, borderRadius: '50%',
                                    background: 'rgba(255,255,255,.85)', border: 'none',
                                    cursor: 'pointer', padding: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: textPrimary,
                                  }}
                                >
                                  <Icon name="menu" size={14} strokeWidth={1.85} />
                                </button>
                              )}

                              {/* Selection chip — shown in select mode in place of menu */}
                              {selectMode && (
                                <div style={{
                                  position: 'absolute', top: 8, insetInlineEnd: 8,
                                  width: 22, height: 22, borderRadius: '50%',
                                  background: isSelected ? textPrimary : 'rgba(255,255,255,.85)',
                                  border: `1.5px solid ${isSelected ? textPrimary : 'rgba(255,255,255,.95)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all .15s',
                                }}>
                                  {isSelected && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                </div>
                              )}

                              {/* Per-tile menu — appears below the trigger.
                                  Anchor to the physical right edge of the tile so the
                                  popup grows LEFTWARD into the grid interior. Without
                                  this, in RTL the menu grows toward the screen edge and
                                  clips on the rightmost tile (the bug photographers were
                                  hitting on the cover slot). */}
                              {isMenuOpen && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute', top: 38, right: 8,
                                    background: cardSolid, border: `1px solid ${border}`,
                                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 5,
                                    minWidth: 180, padding: 4, direction: 'rtl' as const,
                                  }}
                                >
                                  {/* Move to set — sub-list */}
                                  {sections.length > 0 && (
                                    <>
                                      <div style={{
                                        padding: '8px 10px 4px', fontSize: 9, fontWeight: 500,
                                        letterSpacing: '0.18em', textTransform: 'uppercase', color: textMuted,
                                      }}>העבר לסט</div>
                                      <button onClick={() => { moveImageToSection(img.id, null); setImageMenuOpenId(null) }} style={{
                                        width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                        background: img.section_id === null ? bgSubtle : 'transparent',
                                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                        fontSize: 12, color: textPrimary,
                                      }}>ללא סט</button>
                                      {sections.map(s => (
                                        <button key={s.id}
                                          onClick={() => { moveImageToSection(img.id, s.id); setImageMenuOpenId(null) }}
                                          style={{
                                            width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                            background: img.section_id === s.id ? bgSubtle : 'transparent',
                                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                            fontSize: 12, color: textPrimary,
                                          }}>{s.name}</button>
                                      ))}
                                      <div style={{ height: 1, background: border, margin: '4px 0' }} />
                                    </>
                                  )}
                                  {/* Reorder — keyboard alternative for drag,
                                      only meaningful when sorted manually. */}
                                  {photoSort === 'order' && (
                                    <>
                                      <button
                                        onClick={() => { moveImageStep(img.id, 'up'); setImageMenuOpenId(null) }}
                                        style={{
                                          width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                          background: 'transparent', border: 'none', cursor: 'pointer',
                                          fontFamily: 'inherit', fontSize: 12, color: textPrimary,
                                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}>
                                        <span>הזז קדימה</span>
                                        <span aria-hidden="true">↑</span>
                                      </button>
                                      <button
                                        onClick={() => { moveImageStep(img.id, 'down'); setImageMenuOpenId(null) }}
                                        style={{
                                          width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                          background: 'transparent', border: 'none', cursor: 'pointer',
                                          fontFamily: 'inherit', fontSize: 12, color: textPrimary,
                                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}>
                                        <span>הזז אחורה</span>
                                        <span aria-hidden="true">↓</span>
                                      </button>
                                      <div style={{ height: 1, background: border, margin: '4px 0' }} />
                                    </>
                                  )}
                                  <button
                                    onClick={() => { downloadOriginal(img.id); setImageMenuOpenId(null) }}
                                    style={{
                                      width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                      background: 'transparent', border: 'none', cursor: 'pointer',
                                      fontFamily: 'inherit', fontSize: 12, color: textPrimary,
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                    <span>הורדה</span>
                                    <Icon name="download" size={13} strokeWidth={1.85} />
                                  </button>
                                  <button
                                    onClick={() => { deleteSingleImage(img.id); setImageMenuOpenId(null) }}
                                    style={{
                                      width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                      background: 'transparent', border: 'none', cursor: 'pointer',
                                      fontFamily: 'inherit', fontSize: 12, color: '#dc2626',
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                    <span>מחיקה</span>
                                    <Icon name="trash" size={13} strokeWidth={1.85} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      )
                    })()}
                    {galleryImages.length === 0 && !uploading && (
                      <div style={{
                        textAlign: 'center', padding: '80px 24px',
                        background: bgSubtle, border: `1px dashed ${border}`,
                      }}>
                        <Icon name="photo" size={36} strokeWidth={1.2} style={{ opacity: 0.4 }} />
                        <p style={{
                          marginTop: 16, color: textSecondary, fontSize: 14,
                          fontWeight: 500,
                        }}>
                          אין עדיין תמונות בגלריה הזו
                        </p>
                        <p style={{
                          marginTop: 6, color: textMuted, fontSize: 11,
                          fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
                        }}>
                          Drag photos anywhere · or click Add Media
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Sections Tab ── */}
                {editTab === 'sections' && (
                  <div style={{ padding: '0 4px' }}>
                    <p style={{ fontSize: 13, color: textSecondary, marginBottom: 22, lineHeight: 1.6 }}>
                      ארגן את הגלריה לקטעים — "יום 1", "טקס", "רחבה" — והאורחים יוכלו לדפדף ביניהם בקלות.
                    </p>

                    {/* Add new section */}
                    <div style={{
                      display: 'flex', gap: 10, marginBottom: 22,
                      padding: '14px 16px', borderRadius: 14,
                      background: card, border: `1px solid ${border}`,
                    }}>
                      <input
                        type="text"
                        value={newSectionName}
                        onChange={e => setNewSectionName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSection() }}
                        placeholder="שם קטע חדש (למשל: יום 1)"
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 10,
                          background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
                          color: textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      <button
                        onClick={addSection}
                        disabled={!newSectionName.trim()}
                        style={{
                          padding: '10px 20px', borderRadius: 10,
                          background: newSectionName.trim()
                            ? `linear-gradient(135deg, ${accent}, ${accentLight})`
                            : 'rgba(45,196,121,.4)',
                          border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                          cursor: newSectionName.trim() ? 'pointer' : 'not-allowed',
                          fontFamily: 'inherit', transition: 'all .15s',
                        }}
                      >
                        הוסף
                      </button>
                    </div>

                    {/* Sections list */}
                    {sections.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '52px 20px', color: textMuted }}>
                        <div style={{ marginBottom: 14, color: textMuted, opacity: 0.55, display: 'flex', justifyContent: 'center' }}>
                          <Icon name="sections" size={36} strokeWidth={1.4} />
                        </div>
                        <div style={{ fontSize: 14 }}>עדיין אין קטעים. הוסף את הקטע הראשון למעלה.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sections.map(s => (
                          <div key={s.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px', borderRadius: 12,
                            background: card, border: `1px solid ${border}`,
                            transition: 'border-color .15s',
                          }}>
                            <span style={{ color: textMuted, display: 'inline-flex' }}>
                              <Icon name="sections" size={16} strokeWidth={1.85} />
                            </span>
                            <input
                              type="text"
                              defaultValue={s.name}
                              onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== s.name) renameSection(s.id, e.target.value) }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              style={{
                                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                color: textPrimary, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                                padding: '4px 0',
                              }}
                            />
                            <button
                              onClick={() => deleteSection(s.id)}
                              title="מחק"
                              style={{
                                background: 'transparent', border: `1px solid ${border}`, borderRadius: 8,
                                color: '#fca5a5', padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                                fontFamily: 'inherit', transition: 'all .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.35)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = border }}
                            >
                              מחק
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Stories Tab ── */}
                {editTab === 'stories' && (
                  <div style={{ padding: '0 4px' }}>
                    {/* Top strip — heading + Upload Story CTA. Same rhythm as
                        the Photos tab so the editor feels uniform. */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 24,
                    }}>
                      <h3 style={{
                        fontSize: 22, fontWeight: 500, margin: 0,
                        letterSpacing: '-0.015em', color: textPrimary,
                      }}>
                        סטורי
                        <span style={{
                          marginInlineStart: 12, color: textMuted,
                          fontSize: 14, fontWeight: 400,
                        }}>
                          {stories.length}
                        </span>
                      </h3>
                      <input
                        ref={storyFileInputRef}
                        type="file"
                        accept="video/mp4"
                        style={{ display: 'none' }}
                        onChange={(e) => handleStoryUpload(e.target.files)}
                      />
                      <button
                        onClick={() => storyFileInputRef.current?.click()}
                        disabled={storyUploading}
                        style={{
                          padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                          background: textPrimary, border: `1px solid ${textPrimary}`,
                          color: '#fff', cursor: storyUploading ? 'wait' : 'pointer',
                          fontFamily: 'inherit', opacity: storyUploading ? 0.6 : 1,
                          letterSpacing: '0.18em', textTransform: 'uppercase',
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Icon name="plus" size={13} strokeWidth={2} />
                        העלאת סטורי
                      </button>
                    </div>

                    {/* Helper copy — explains the supported formats + size limit
                        so photographers don't waste a 2GB upload before the
                        client-side validator rejects it. */}
                    <p style={{
                      fontSize: 13, color: textSecondary,
                      marginBottom: 22, lineHeight: 1.6,
                    }}>
                      העלו סרטון MP4 שיוצג בנגן הסטורי המלא של הגלריה.
                      גודל מקסימלי: 100MB.
                    </p>

                    {/* Upload progress strip — mirrors the Photos tab's
                        single-row progress UI so the photographer recognizes
                        the pattern. */}
                    {storyUploading && storyUploadProgress && (
                      <div style={{
                        marginBottom: 20, padding: '14px 18px',
                        background: bgSubtle, border: `1px solid ${border}`,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: 12, color: textPrimary, marginBottom: 8,
                          fontWeight: 500, letterSpacing: '0.04em',
                        }}>
                          <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', maxWidth: '70%',
                          }}>
                            מעלה: {storyUploadProgress.filename}
                          </span>
                          <span>{storyUploadProgress.pct}%</span>
                        </div>
                        <div style={{ width: '100%', height: 2, background: border, overflow: 'hidden' }}>
                          <div style={{
                            width: `${storyUploadProgress.pct}%`,
                            height: '100%', background: textPrimary,
                            transition: 'width .3s',
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Stories grid — Pixieset-style packed thumbnails. Each
                        clip is a 9:16 video preview with a per-tile menu.
                        Hover plays the video for a quick preview without
                        opening the player; click opens the menu. */}
                    {stories.length === 0 && !storyUploading ? (
                      <div style={{
                        textAlign: 'center', padding: '52px 20px',
                        color: textMuted,
                        border: `1px dashed ${border}`,
                        background: bgSubtle,
                      }}>
                        <div style={{ marginBottom: 14, color: textMuted, opacity: 0.55, display: 'flex', justifyContent: 'center' }}>
                          <Icon name="stories" size={36} strokeWidth={1.4} />
                        </div>
                        <div style={{ fontSize: 14 }}>
                          עדיין אין סטוריז. הוסף את הראשון בלחיצה על "העלאת סטורי".
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: 12,
                      }}>
                        {stories.map(st => {
                          const isHovered = hoveredStoryId === st.id
                          const isMenuOpen = storyMenuOpenId === st.id
                          const isConfirming = confirmDeleteStoryId === st.id
                          const url = storageUrl(STORY_BUCKET, st.storage_path)
                          return (
                            <div
                              key={st.id}
                              onMouseEnter={() => setHoveredStoryId(st.id)}
                              onMouseLeave={() => setHoveredStoryId(null)}
                              style={{
                                position: 'relative', aspectRatio: '9 / 16',
                                background: bgSubtle, overflow: 'hidden',
                                border: `1px solid ${border}`,
                                borderRadius: 4,
                              }}
                            >
                              <video
                                src={url}
                                muted
                                playsInline
                                preload="metadata"
                                onMouseEnter={(e) => { void (e.target as HTMLVideoElement).play().catch(() => { /* autoplay blocked */ }) }}
                                onMouseLeave={(e) => {
                                  const v = e.target as HTMLVideoElement
                                  v.pause(); v.currentTime = 0
                                }}
                                style={{
                                  width: '100%', height: '100%',
                                  objectFit: 'cover', display: 'block',
                                }}
                              />

                              {/* Three-dot menu — shown on hover (mouse) or
                                  always on touch devices. WCAG: focusable
                                  button, aria-label in Hebrew. */}
                              {(isHovered || isMenuOpen || isConfirming) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setStoryMenuOpenId(isMenuOpen ? null : st.id)
                                  }}
                                  aria-label="עוד"
                                  aria-haspopup="menu"
                                  aria-expanded={isMenuOpen}
                                  style={{
                                    position: 'absolute', top: 8, insetInlineEnd: 8,
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.92)',
                                    border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: textPrimary, padding: 0,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                    <circle cx="5" cy="12" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="19" cy="12" r="2" />
                                  </svg>
                                </button>
                              )}

                              {/* Menu — click "מחיקה" → swap to inline confirm. */}
                              {isMenuOpen && !isConfirming && (
                                <div style={{
                                  position: 'absolute', top: 40, insetInlineEnd: 8,
                                  background: cardSolid, border: `1px solid ${border}`,
                                  boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 5,
                                  minWidth: 140, padding: 4, borderRadius: 4,
                                }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setStoryMenuOpenId(null)
                                      setConfirmDeleteStoryId(st.id)
                                    }}
                                    style={{
                                      width: '100%', textAlign: 'right' as const,
                                      padding: '8px 10px', borderRadius: 2,
                                      background: 'transparent', border: 'none', cursor: 'pointer',
                                      fontFamily: 'inherit', fontSize: 12, color: '#dc2626',
                                    }}
                                  >
                                    מחיקה
                                  </button>
                                </div>
                              )}

                              {/* Inline confirm — Pixieset pattern: replaces
                                  the menu with a confirm/cancel pair so the
                                  photographer can't delete by accident. */}
                              {isConfirming && (
                                <div style={{
                                  position: 'absolute', inset: 0,
                                  background: 'rgba(20,20,19,0.86)',
                                  display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', justifyContent: 'center',
                                  gap: 10, padding: 12,
                                  textAlign: 'center', color: '#fff',
                                }}>
                                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                                    למחוק את הסטורי?
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void handleStoryDelete(st.id)
                                      }}
                                      style={{
                                        padding: '6px 14px', borderRadius: 2,
                                        background: '#dc2626', border: 'none',
                                        color: '#fff', cursor: 'pointer',
                                        fontFamily: 'inherit', fontSize: 11,
                                        fontWeight: 500, letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      מחק
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setConfirmDeleteStoryId(null)
                                      }}
                                      style={{
                                        padding: '6px 14px', borderRadius: 2,
                                        background: 'transparent',
                                        border: '1px solid rgba(255,255,255,0.4)',
                                        color: '#fff', cursor: 'pointer',
                                        fontFamily: 'inherit', fontSize: 11,
                                        fontWeight: 500, letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      ביטול
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Bottom caption — style label + duration. */}
                              <div style={{
                                position: 'absolute', bottom: 0, insetInline: 0,
                                padding: '20px 10px 8px',
                                background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                                color: '#fff', fontSize: 10,
                                letterSpacing: '0.14em', textTransform: 'uppercase',
                                fontWeight: 500,
                                display: 'flex', justifyContent: 'space-between',
                                pointerEvents: 'none',
                              }}>
                                <span style={{
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', maxWidth: '70%',
                                }}>
                                  {st.style ?? 'manual'}
                                </span>
                                {st.duration ? <span>{st.duration}s</span> : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Activities Tab ── */}
                {editTab === 'activities' && (
                  <div>
                    {/* Eyebrow + display heading — same rhythm as the rest of
                        the editor's tabs (e.g. the Photos tab heading). */}
                    <div style={{
                      fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                      color: textMuted, textTransform: 'uppercase',
                      marginBottom: 10,
                    }}>
                      Activity
                    </div>
                    <h3 style={{
                      fontSize: 22, fontWeight: 500, margin: '0 0 28px',
                      letterSpacing: '-0.015em', color: textPrimary,
                    }}>
                      פעילות בגלריה
                    </h3>

                    {activityLoading && !activitySummary ? (
                      <div style={{
                        textAlign: 'center', padding: '60px 0',
                        color: textMuted, fontSize: 11, fontWeight: 500,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                      }}>
                        Loading
                      </div>
                    ) : !activitySummary || (activitySummary.downloads_total === 0 && activitySummary.favorites_total === 0 && activitySummary.emails_total === 0) ? (
                      <div style={{
                        textAlign: 'center', padding: '80px 24px',
                        background: bgSubtle, border: `1px dashed ${border}`,
                      }}>
                        <Icon name="activity" size={36} strokeWidth={1.2} style={{ opacity: 0.4 }} />
                        <p style={{
                          marginTop: 16, color: textSecondary, fontSize: 14,
                          fontWeight: 500,
                        }}>
                          עדיין אין פעילות
                        </p>
                        <p style={{
                          marginTop: 6, color: textMuted, fontSize: 11,
                          fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
                        }}>
                          Share gallery · activity will appear here
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Stat tiles — single bordered grid with vertical
                            hairline dividers, mirrors the dashboard's stats row. */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: 0, marginBottom: 36,
                          border: `1px solid ${border}`, background: bgSubtle,
                        }}>
                          {([
                            { label: 'Downloads', value: activitySummary.downloads_total, icon: 'download' as IconName },
                            { label: 'Favorites', value: activitySummary.favorites_total, icon: 'heart'    as IconName },
                            { label: 'Emails',    value: activitySummary.emails_total,    icon: 'mail'     as IconName },
                          ]).map((s, i) => (
                            <div key={s.label} style={{
                              padding: '24px 24px',
                              borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                            }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                                fontSize: 10, color: textMuted,
                                fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
                              }}>
                                <Icon name={s.icon} size={12} strokeWidth={1.6} />
                                <span>{s.label}</span>
                              </div>
                              <div style={{
                                fontSize: 28, fontWeight: 400,
                                letterSpacing: '-0.025em', color: textPrimary, lineHeight: 1,
                                fontFeatureSettings: '"tnum" 1, "lnum" 1',
                              }}>
                                {s.value.toLocaleString('he-IL')}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Recent downloads */}
                        {activitySummary.recent_downloads.length > 0 && (
                          <section style={{ marginBottom: 32 }}>
                            <div style={{
                              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                              color: textMuted, textTransform: 'uppercase',
                              marginBottom: 12,
                            }}>
                              Recent Downloads
                            </div>
                            <div style={{ borderTop: `1px solid ${border}` }}>
                              {activitySummary.recent_downloads.slice(0, 10).map(d => {
                                const img = galleryImages.find(g => g.id === d.image_id)
                                return (
                                  <div key={d.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 4px', borderBottom: `1px solid ${border}`,
                                    fontSize: 13, color: textPrimary,
                                  }}>
                                    <span style={{
                                      flex: 1, direction: 'ltr', textAlign: 'right' as const,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      {img?.filename ?? '(תמונה נמחקה)'}
                                    </span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 500,
                                      letterSpacing: '0.18em', textTransform: 'uppercase',
                                      color: textMuted,
                                    }}>
                                      {d.resolution === 'original' ? 'Original' : 'Web'}
                                      {d.download_kind === 'batch' ? ' · Batch' : ''}
                                    </span>
                                    <span style={{
                                      color: textMuted, fontSize: 12,
                                      fontFeatureSettings: '"tnum" 1, "lnum" 1',
                                      minWidth: 110, textAlign: 'left' as const,
                                    }}>
                                      {new Date(d.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        )}

                        {/* Recent favorites */}
                        {activitySummary.recent_favorites.length > 0 && (
                          <section style={{ marginBottom: 32 }}>
                            <div style={{
                              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                              color: textMuted, textTransform: 'uppercase',
                              marginBottom: 12,
                            }}>
                              Recent Favorites
                            </div>
                            <div style={{ borderTop: `1px solid ${border}` }}>
                              {activitySummary.recent_favorites.slice(0, 10).map(f => {
                                const img = galleryImages.find(g => g.id === f.image_id)
                                return (
                                  <div key={f.id} style={{
                                    padding: '12px 4px', borderBottom: `1px solid ${border}`,
                                    fontSize: 13, color: textPrimary,
                                    display: 'flex', flexDirection: 'column', gap: 4,
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <span style={{
                                        flex: 1, direction: 'ltr', textAlign: 'right' as const,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>
                                        {img?.filename ?? '(תמונה נמחקה)'}
                                      </span>
                                      {f.guest_name && (
                                        <span style={{ fontSize: 12, color: textSecondary }}>
                                          {f.guest_name}
                                        </span>
                                      )}
                                      <span style={{
                                        color: textMuted, fontSize: 12,
                                        fontFeatureSettings: '"tnum" 1, "lnum" 1',
                                        minWidth: 110, textAlign: 'left' as const,
                                      }}>
                                        {new Date(f.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    {f.note && (
                                      <div style={{
                                        fontSize: 12, color: textSecondary,
                                        fontStyle: 'italic', lineHeight: 1.5,
                                      }}>
                                        "{f.note}"
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        )}

                        {/* Recent email shares */}
                        {activitySummary.recent_emails.length > 0 && (
                          <section style={{ marginBottom: 12 }}>
                            <div style={{
                              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                              color: textMuted, textTransform: 'uppercase',
                              marginBottom: 12,
                            }}>
                              Recent Emails
                            </div>
                            <div style={{ borderTop: `1px solid ${border}` }}>
                              {activitySummary.recent_emails.slice(0, 10).map(e => (
                                <div key={e.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '12px 4px', borderBottom: `1px solid ${border}`,
                                  fontSize: 13, color: textPrimary,
                                }}>
                                  <span style={{
                                    flex: 1, direction: 'ltr', textAlign: 'right' as const,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {e.recipient_email}
                                  </span>
                                  <span style={{
                                    fontSize: 10, fontWeight: 500,
                                    letterSpacing: '0.18em', textTransform: 'uppercase',
                                    color: e.status === 'sent' ? statusLive : textMuted,
                                  }}>
                                    {e.status === 'sent' ? 'Sent' : 'Failed'}
                                  </span>
                                  <span style={{
                                    color: textMuted, fontSize: 12,
                                    fontFeatureSettings: '"tnum" 1, "lnum" 1',
                                    minWidth: 110, textAlign: 'left' as const,
                                  }}>
                                    {new Date(e.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Settings Tab ── */}
                {editTab === 'settings' && (() => {
                  // Editorial Settings — local helpers shared across the
                  // toggle rows + picker tiles to keep markup compact.
                  const ds = (editingGallery.delivery_settings ?? {}) as Record<string, unknown>
                  const Toggle = ({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) => (
                    <div
                      role="switch" aria-checked={on}
                      onClick={onClick}
                      style={{
                        width: 44, height: 24, borderRadius: 24, padding: 2,
                        background: on ? textPrimary : border,
                        transition: 'background .2s', flexShrink: 0,
                        cursor: 'pointer', position: 'relative',
                      }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 10, background: '#fff',
                        transition: 'transform .2s',
                        transform: on ? 'translateX(-20px)' : 'translateX(0)',
                        boxShadow: '0 1px 3px rgba(0,0,0,.18)',
                      }} />
                    </div>
                  )
                  const ToggleRow = ({ label, desc, on, onChange, last }: {
                    label: string; desc: string; on: boolean; onChange: () => void; last?: boolean
                  }) => (
                    <div onClick={(e) => { e.stopPropagation(); onChange() }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 0', cursor: 'pointer', userSelect: 'none', gap: 16,
                        borderBottom: last ? 'none' : `1px solid ${border}`,
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                      <Toggle on={on} onClick={(e) => { e.stopPropagation(); onChange() }} />
                    </div>
                  )
                  const Section = ({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) => (
                    <section style={{
                      padding: '24px 24px 16px',
                      background: bgSubtle,
                      border: `1px solid ${border}`,
                    }}>
                      <div style={{
                        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                        color: textMuted, textTransform: 'uppercase', marginBottom: 12,
                      }}>{eyebrow}</div>
                      {children}
                    </section>
                  )
                  const PickerTile = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
                    <button onClick={onClick} style={{
                      flex: 1, padding: '14px 16px', cursor: 'pointer',
                      border: `1px solid ${active ? textPrimary : border}`,
                      background: active ? '#fff' : 'transparent',
                      borderRadius: 2, fontFamily: 'inherit', textAlign: 'right' as const,
                      transition: 'border-color .15s, background .15s',
                    }}>{children}</button>
                  )
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Page eyebrow + title */}
                    <div>
                      <div style={{
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                        color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                      }}>Settings</div>
                      <h3 style={{
                        fontSize: 22, fontWeight: 500, margin: 0,
                        letterSpacing: '-0.015em', color: textPrimary,
                      }}>הגדרות גלריה</h3>
                    </div>

                    {/* Downloads */}
                    <Section eyebrow="הורדות">
                      {([
                        { key: 'downloadsEnabled',    label: 'אפשר הורדת תמונות', desc: 'אורחים יוכלו להוריד תמונות בודדות' },
                        { key: 'bulkDownloadEnabled', label: 'הורדה מרוכזת',     desc: 'אפשר הורדת כל התמונות בבת אחת' },
                        { key: 'trackDownloads',      label: 'מעקב הורדות',      desc: 'עקוב מי הוריד ומתי' },
                      ] as const).map((opt, i, arr) => (
                        <ToggleRow key={opt.key}
                          label={opt.label} desc={opt.desc}
                          on={Boolean(ds[opt.key])}
                          onChange={() => updateGallerySetting(opt.key, !ds[opt.key])}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </Section>

                    {/* Privacy */}
                    <Section eyebrow="פרטיות">
                      {([
                        { key: 'clientHidePhotosEnabled', label: 'אפשר לאורחים להסתיר תמונות', desc: 'כל אורח יכול להסתיר תמונות שלו מאחרים' },
                        { key: 'clientSelectionEnabled',  label: 'בחירת תמונות',                desc: 'אפשר ללקוח לבחור תמונות מועדפות' },
                      ] as const).map((opt, i, arr) => (
                        <ToggleRow key={opt.key}
                          label={opt.label} desc={opt.desc}
                          on={Boolean(ds[opt.key])}
                          onChange={() => updateGallerySetting(opt.key, !ds[opt.key])}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </Section>

                    {/* Face Recognition */}
                    <Section eyebrow="זיהוי פנים">
                      <ToggleRow
                        label="הפעל זיהוי פנים"
                        desc="אורחים יוכלו למצוא את עצמם בסלפי. עלות: ללא תוספת טוקנים."
                        on={Boolean(ds.faceIndexEnabled)}
                        onChange={async () => {
                          const newVal = !ds.faceIndexEnabled
                          await updateGallerySetting('faceIndexEnabled', newVal)
                          await supabase.from('galleries').update({ face_index_enabled: newVal }).eq('id', editingGallery.id)
                        }}
                        last
                      />
                      {Boolean(ds.faceIndexEnabled) && (
                        <div style={{ marginTop: 12, paddingTop: 16, borderTop: `1px solid ${border}` }}>
                          <div style={{
                            fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                            color: textMuted, textTransform: 'uppercase', marginBottom: 12,
                          }}>מצב פרטיות</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {([
                              { id: 'open',    label: 'פתוח',  desc: 'כולם רואים את כל התמונות' },
                              { id: 'private', label: 'פרטי',  desc: 'כל אורח רואה רק את התמונות שלו' },
                            ] as const).map(m => {
                              const active = ((ds.facePrivacyMode as string) || 'open') === m.id
                              return (
                                <PickerTile key={m.id} active={active} onClick={() => updateGallerySetting('facePrivacyMode', m.id)}>
                                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary, marginBottom: 4 }}>{m.label}</div>
                                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{m.desc}</div>
                                </PickerTile>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </Section>

                    {/* Layout */}
                    <Section eyebrow="תצוגה">
                      <div style={{ fontSize: 13, color: textPrimary, fontWeight: 500, marginBottom: 12 }}>סגנון פיד</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {([
                          { id: 'grid',     label: 'רשת' },
                          { id: 'masonry',  label: 'מוזאיקה' },
                          { id: 'carousel', label: 'קרוסלה' },
                        ] as const).map(l => {
                          const active = ((ds.feedLayout as string) || 'grid') === l.id
                          return (
                            <button key={l.id} onClick={() => updateGallerySetting('feedLayout', l.id)} style={{
                              flex: 1, padding: '12px 16px',
                              border: `1px solid ${active ? textPrimary : border}`,
                              background: active ? '#fff' : 'transparent',
                              borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary,
                              transition: 'border-color .15s, background .15s',
                            }}>{l.label}</button>
                          )
                        })}
                      </div>
                    </Section>

                    {/* Theme color */}
                    <Section eyebrow="צבע ראשי">
                      <div style={{ fontSize: 12, color: textMuted, marginBottom: 14, lineHeight: 1.5 }}>
                        הצבע שמופיע בכפתורים ומסגרות בגלריה הציבורית
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {([
                          { id: 'charcoal', label: 'פחם',     color: '#141413' },
                          { id: 'sage',     label: 'מרווה',   color: '#7B8F6E' },
                          { id: 'rose',     label: 'ורוד',     color: '#C18A8A' },
                          { id: 'amber',    label: 'ענברי',   color: '#A67C52' },
                          { id: 'teal',     label: 'טורקיז',  color: '#5E8A8A' },
                          { id: 'slate',    label: 'אפור',    color: '#64748b' },
                        ] as const).map(c => {
                          const active = ((ds.themeColor as string) || 'charcoal') === c.id
                          return (
                            <button key={c.id} onClick={() => updateGallerySetting('themeColor', c.id)} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                              padding: '10px 14px',
                              border: `1px solid ${active ? textPrimary : border}`,
                              background: active ? '#fff' : 'transparent',
                              borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'border-color .15s, background .15s',
                            }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: c.color,
                              }} />
                              <span style={{
                                fontSize: 10, fontWeight: 500, color: textPrimary,
                                letterSpacing: '0.04em',
                              }}>
                                {c.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </Section>

                    {/* Watermark */}
                    <Section eyebrow="ווטרמרק">
                      <ToggleRow
                        label="הצג ווטרמרק על תצוגות web"
                        desc="שם העסק יופיע בפינה — מקור ההורדה תמיד נקי"
                        on={Boolean(ds.watermarkEnabled)}
                        onChange={() => updateGallerySetting('watermarkEnabled', !ds.watermarkEnabled)}
                        last
                      />
                      {Boolean(ds.watermarkEnabled) && (
                        <div style={{ marginTop: 12, paddingTop: 16, borderTop: `1px solid ${border}` }}>
                          <label style={{ display: 'block' }}>
                            <span style={{
                              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                              color: textMuted, textTransform: 'uppercase',
                              display: 'block', marginBottom: 8,
                            }}>טקסט</span>
                            <input
                              type="text"
                              value={String(ds.watermarkText ?? '')}
                              onChange={(e) => updateGallerySetting('watermarkText', e.target.value)}
                              placeholder="© השם שלך"
                              style={{
                                width: '100%', padding: '12px 14px', borderRadius: 2,
                                background: '#fff', border: `1px solid ${border}`,
                                color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                                outline: 'none', boxSizing: 'border-box',
                                transition: 'border-color .15s',
                              }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = textPrimary }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = border }}
                            />
                          </label>
                          <div style={{
                            fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                            color: textMuted, textTransform: 'uppercase',
                            marginTop: 18, marginBottom: 10,
                          }}>מיקום</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {([
                              { id: 'bottom-right', label: '↘' },
                              { id: 'bottom-left',  label: '↙' },
                              { id: 'top-right',    label: '↗' },
                              { id: 'top-left',     label: '↖' },
                              { id: 'center',       label: '＋' },
                            ] as const).map(p => {
                              const active = ((ds.watermarkPosition as string) || 'bottom-right') === p.id
                              return (
                                <button key={p.id} onClick={() => updateGallerySetting('watermarkPosition', p.id)}
                                  aria-label={p.id}
                                  style={{
                                    width: 44, height: 44, borderRadius: 2,
                                    background: active ? '#fff' : 'transparent',
                                    border: `1px solid ${active ? textPrimary : border}`,
                                    color: textPrimary,
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 18,
                                    transition: 'border-color .15s, background .15s',
                                  }}>{p.label}</button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </Section>

                    {/* ── Domain (account-level) ──────────────────────────
                        Lives at the bottom of the gallery editor's Settings
                        tab for now — the photographer doesn't have a
                        dedicated Studio Settings page yet. Three states:
                        upsell card (plan doesn't include it), input form
                        (no domain set), DNS-pending card with copy + verify
                        buttons, or verified card with a remove button. */}
                    <Section eyebrow="דומיין מותאם">
                      {!customDomainEnabled ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
                            תכנית עסקית בלבד
                          </div>
                          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
                            חברו דומיין משלכם — למשל photos.studio-shem.co.il — ושלחו ללקוחות קישור ממותג במקום pixflow-ai.com.
                          </div>
                          <button
                            type="button"
                            onClick={() => { window.location.href = '/#pricing' }}
                            style={{
                              padding: '10px 18px', borderRadius: 2,
                              background: textPrimary, color: '#fff',
                              border: `1px solid ${textPrimary}`,
                              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            שדרוג לתכנית עסקית
                          </button>
                        </div>
                      ) : customDomainStatus === 'verified' && customDomain ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{
                              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                              background: statusLive,
                            }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
                              הדומיין מאומת ✓
                            </span>
                          </div>
                          <a
                            href={`https://${customDomain}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-block', marginBottom: 16,
                              fontSize: 14, color: textPrimary, textDecoration: 'underline',
                              direction: 'ltr', unicodeBidi: 'embed',
                            }}
                          >
                            {customDomain}
                          </a>
                          <div>
                            <button
                              type="button"
                              onClick={removeCustomDomain}
                              disabled={domainSaving}
                              style={{
                                padding: '10px 18px', borderRadius: 2,
                                background: 'transparent', color: textPrimary,
                                border: `1px solid ${border}`,
                                fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: domainSaving ? 0.6 : 1,
                              }}
                            >
                              {domainSaving ? 'מסיר...' : 'הסר דומיין'}
                            </button>
                          </div>
                        </div>
                      ) : customDomainStatus === 'pending_dns' && customDomain && customDomainToken ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
                            המתנה לאימות DNS — עד 72 שעות
                          </div>
                          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
                            הוסיפו את רשומת ה־TXT הבאה אצל ספק הדומיין שלכם. ברגע שה־DNS יתעדכן, נאמת את הבעלות אוטומטית.
                          </div>

                          {/* DNS record card */}
                          <div style={{
                            background: '#fff',
                            border: `1px solid ${border}`,
                            padding: '14px 16px',
                            marginBottom: 16,
                            display: 'grid',
                            gridTemplateColumns: '88px 1fr',
                            gap: '10px 14px',
                            direction: 'ltr',
                            unicodeBidi: 'embed',
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Type</div>
                            <div style={{ fontSize: 13, color: textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>TXT</div>

                            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Name</div>
                            <div style={{ fontSize: 13, color: textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
                              {`_pixflow-verify.${customDomain}`}
                            </div>

                            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Value</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <code style={{
                                flex: 1,
                                fontSize: 13, color: textPrimary,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                background: bgSubtle,
                                padding: '6px 10px',
                                border: `1px solid ${border}`,
                                overflowWrap: 'anywhere',
                              }}>
                                {customDomainToken}
                              </code>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(customDomainToken)
                                    setDomainCopied(true)
                                    setTimeout(() => setDomainCopied(false), 1500)
                                  } catch {
                                    // Ignore: clipboard may be blocked. The value
                                    // is visible on screen so the photographer
                                    // can still copy it manually.
                                  }
                                }}
                                style={{
                                  padding: '6px 12px', borderRadius: 2,
                                  background: 'transparent', color: textPrimary,
                                  border: `1px solid ${border}`,
                                  fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
                                  textTransform: 'uppercase',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  flexShrink: 0,
                                }}
                              >
                                {domainCopied ? 'הועתק' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={recheckCustomDomain}
                              disabled={domainSaving}
                              style={{
                                padding: '10px 18px', borderRadius: 2,
                                background: textPrimary, color: '#fff',
                                border: `1px solid ${textPrimary}`,
                                fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: domainSaving ? 0.6 : 1,
                              }}
                            >
                              בדוק שוב עכשיו
                            </button>
                            <button
                              type="button"
                              onClick={removeCustomDomain}
                              disabled={domainSaving}
                              style={{
                                padding: '10px 18px', borderRadius: 2,
                                background: 'transparent', color: textPrimary,
                                border: `1px solid ${border}`,
                                fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: domainSaving ? 0.6 : 1,
                              }}
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 14 }}>
                            חברו דומיין שבבעלותכם וגלריות יוצגו תחתיו במקום תחת pixflow-ai.com.
                          </div>
                          <label style={{ display: 'block', marginBottom: 12 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                              color: textMuted, textTransform: 'uppercase',
                              display: 'block', marginBottom: 8,
                            }}>הדומיין המותאם שלך</span>
                            <input
                              type="text"
                              value={domainInput}
                              onChange={(e) => { setDomainInput(e.target.value); setDomainError(null) }}
                              placeholder="photos.studio-shem.co.il"
                              dir="ltr"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              style={{
                                width: '100%', padding: '12px 14px', borderRadius: 2,
                                background: '#fff', border: `1px solid ${domainError ? '#A85B5B' : border}`,
                                color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                                outline: 'none', boxSizing: 'border-box',
                                transition: 'border-color .15s',
                                textAlign: 'left',
                              }}
                              onFocus={(e) => { if (!domainError) e.currentTarget.style.borderColor = textPrimary }}
                              onBlur={(e) => { if (!domainError) e.currentTarget.style.borderColor = border }}
                            />
                          </label>
                          {domainError && (
                            <div style={{ fontSize: 12, color: '#A85B5B', marginBottom: 12, lineHeight: 1.5 }}>
                              {domainError}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={submitCustomDomain}
                            disabled={domainSaving || !domainInput.trim()}
                            style={{
                              padding: '10px 18px', borderRadius: 2,
                              background: textPrimary, color: '#fff',
                              border: `1px solid ${textPrimary}`,
                              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              cursor: (domainSaving || !domainInput.trim()) ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              opacity: (domainSaving || !domainInput.trim()) ? 0.5 : 1,
                            }}
                          >
                            {domainSaving ? 'שומר...' : 'בדוק זמינות ושמור'}
                          </button>
                        </div>
                      )}
                    </Section>
                  </div>
                  )
                })()}

                {/* ── Design Tab — Pixieset 5-pane sub-nav ── */}
                {editTab === 'welcome' && (() => {
                  const ds = (editingGallery.delivery_settings ?? {}) as Record<string, unknown>
                  const inputBase = {
                    width: '100%', padding: '12px 14px', borderRadius: 2,
                    border: `1px solid ${border}`,
                    background: '#fff', color: textPrimary, fontSize: 14,
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
                    transition: 'border-color .15s', direction: 'rtl' as const,
                  }
                  const labelStyle = {
                    fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                    color: textMuted, textTransform: 'uppercase' as const,
                    display: 'block' as const, marginBottom: 8,
                  }
                  // PickerTile factory used by every sub-tab. Selected state =
                  // cream-on-white surface with a 1px charcoal border, matching
                  // the pattern used in Settings + New Gallery.
                  const tileStyle = (selected: boolean) => ({
                    background: selected ? '#fff' : 'transparent',
                    border: `1px solid ${selected ? textPrimary : border}`,
                    borderRadius: 2, padding: '16px 12px', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'right' as const,
                    transition: 'border-color .15s, background .15s',
                    display: 'flex' as const, flexDirection: 'column' as const,
                    alignItems: 'center' as const, gap: 8,
                  })
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Page eyebrow + title */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                        color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                      }}>Design</div>
                      <h3 style={{
                        fontSize: 22, fontWeight: 500, margin: 0,
                        letterSpacing: '-0.015em', color: textPrimary,
                      }}>עיצוב הגלריה</h3>
                    </div>

                    {/* Sub-tab bar — horizontal, hairline-bottom, active gets
                        2px charcoal underline. Mirrors Pixieset's Design page. */}
                    <div style={{
                      display: 'flex', gap: 0, borderBottom: `1px solid ${border}`,
                      marginBottom: 28, overflowX: 'auto',
                    }}>
                      {([
                        { id: 'cover' as const, label: 'Cover' },
                        { id: 'type'  as const, label: 'Typography' },
                        { id: 'color' as const, label: 'Color' },
                        { id: 'grid'  as const, label: 'Grid' },
                        { id: 'nav'   as const, label: 'Navigation' },
                      ]).map(t => {
                        const active = designSubTab === t.id
                        return (
                          <button key={t.id} onClick={() => setDesignSubTab(t.id)}
                            style={{
                              padding: '14px 22px',
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              fontFamily: 'inherit',
                              fontSize: 11, fontWeight: 500,
                              letterSpacing: '0.22em', textTransform: 'uppercase',
                              color: active ? textPrimary : textMuted,
                              borderBottom: active ? `2px solid ${textPrimary}` : '2px solid transparent',
                              marginBottom: -1,
                              transition: 'color .15s, border-color .15s',
                              flexShrink: 0,
                            }}>
                            {t.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* ── Cover — welcome style + cover image + title + client name ── */}
                    {designSubTab === 'cover' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        <div>
                          <div style={{ ...labelStyle }}>סגנון מסך פתיחה</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {([
                              { id: 'mosaic' as const,    label: 'מוזאיקה', desc: 'תמונות גוללות ברקע',           icon: 'sections' as IconName },
                              { id: 'cinematic' as const, label: 'קולנועי', desc: 'תמונת רקע עם אפקט זום',     icon: 'photo'    as IconName },
                              { id: 'minimal' as const,   label: 'מינימלי', desc: 'רקע נקי, טיפוגרפיה בלבד',   icon: 'gallery'  as IconName },
                            ]).map(s => {
                              const selected = ((ds.welcomeStyle as string) || 'mosaic') === s.id
                              return (
                                <button key={s.id} onClick={() => updateGallerySetting('welcomeStyle', s.id)} style={tileStyle(selected)}>
                                  <Icon name={s.icon} size={22} strokeWidth={selected ? 1.85 : 1.4} />
                                  <div style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: textPrimary }}>{s.label}</div>
                                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4, textAlign: 'center' }}>{s.desc}</div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Cover image picker — always visible (any welcome
                            style can use a cover, not just cinematic). */}
                        {galleryImages.length > 0 && (
                          <div>
                            <div style={{
                              ...labelStyle, marginBottom: 12,
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                              <span>תמונת שער</span>
                              {ds.coverImageUrl && (
                                <button onClick={() => updateGallerySetting('coverImageUrl', null)} style={{
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  color: textMuted, fontFamily: 'inherit',
                                  fontSize: 9, fontWeight: 500, letterSpacing: '0.18em',
                                  textTransform: 'uppercase', padding: 0,
                                }}>נקה</button>
                              )}
                            </div>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                              gap: 4,
                            }}>
                              {galleryImages.slice(0, 24).map(img => {
                                const url = imgUrl(img.storage_path)
                                const isCover = ds.coverImageUrl === url
                                return (
                                  <button key={img.id}
                                    onClick={() => updateGallerySetting('coverImageUrl', url)}
                                    aria-label={isCover ? 'תמונת שער נוכחית' : 'הגדר כתמונת שער'}
                                    style={{
                                      padding: 0, border: 'none', background: 'transparent',
                                      aspectRatio: '4 / 3', overflow: 'hidden',
                                      cursor: 'pointer',
                                      outline: isCover ? `2px solid ${textPrimary}` : 'none',
                                      outlineOffset: isCover ? -2 : 0,
                                      opacity: isCover ? 1 : 0.92,
                                      transition: 'outline-offset .15s, opacity .15s',
                                    }}>
                                    <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                                      alt="" loading="lazy"
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <label style={{ display: 'block' }}>
                          <span style={{ ...labelStyle }}>כותרת הגלריה</span>
                          <input
                            type="text"
                            value={(ds.galleryTitle as string) || editingGallery.name}
                            onChange={e => updateGallerySetting('galleryTitle', e.target.value)}
                            style={inputBase}
                            onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                            onBlur={e => { e.currentTarget.style.borderColor = border }}
                          />
                        </label>
                        <label style={{ display: 'block' }}>
                          <span style={{ ...labelStyle }}>שם לקוח / אירוע</span>
                          <input
                            type="text"
                            value={(ds.clientName as string) || ''}
                            onChange={e => updateGallerySetting('clientName', e.target.value)}
                            placeholder="לדוגמה: יוסי ומיכל"
                            style={inputBase}
                            onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                            onBlur={e => { e.currentTarget.style.borderColor = border }}
                          />
                        </label>
                      </div>
                    )}

                    {/* ── Typography — heading + body font ── */}
                    {designSubTab === 'type' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        {([
                          { key: 'headingFont', label: 'פונט כותרות', defaultV: 'Inter Tight' },
                          { key: 'bodyFont',    label: 'פונט גוף',    defaultV: 'Noto Sans Hebrew' },
                        ] as const).map(f => {
                          const fonts = [
                            'Inter Tight',
                            'Noto Sans Hebrew',
                            'Heebo',
                            'Noto Serif',
                            'Cormorant Garamond',
                            'Playfair Display',
                          ]
                          const current = (ds[f.key] as string) || f.defaultV
                          return (
                            <div key={f.key}>
                              <div style={{ ...labelStyle }}>{f.label}</div>
                              <select
                                value={current}
                                onChange={e => updateGallerySetting(f.key, e.target.value)}
                                style={{ ...inputBase, cursor: 'pointer' }}
                                onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                                onBlur={e => { e.currentTarget.style.borderColor = border }}
                              >
                                {fonts.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                              {/* Preview line */}
                              <div style={{
                                marginTop: 12, padding: '20px 18px',
                                background: bgSubtle, border: `1px solid ${border}`,
                                fontFamily: `'${current}', sans-serif`,
                                fontSize: f.key === 'headingFont' ? 24 : 14,
                                fontWeight: f.key === 'headingFont' ? 500 : 400,
                                color: textPrimary,
                                letterSpacing: f.key === 'headingFont' ? '-0.015em' : '0',
                                lineHeight: f.key === 'headingFont' ? 1.15 : 1.5,
                              }}>
                                {f.key === 'headingFont' ? 'הגלריה של יוסי ומיכל' : 'תיאור קצר של האירוע מופיע כאן בגוף הטקסט.'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* ── Color — palette picker ── */}
                    {designSubTab === 'color' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
                          הצבע הראשי משפיע על כפתורים, מסגרות ולוגו בגלריה הציבורית.
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {([
                            { id: 'charcoal', label: 'פחם',     color: '#141413' },
                            { id: 'sage',     label: 'מרווה',   color: '#7B8F6E' },
                            { id: 'rose',     label: 'ורוד',     color: '#C18A8A' },
                            { id: 'amber',    label: 'ענברי',   color: '#A67C52' },
                            { id: 'teal',     label: 'טורקיז',  color: '#5E8A8A' },
                            { id: 'slate',    label: 'אפור',    color: '#64748b' },
                          ] as const).map(c => {
                            const active = ((ds.themeColor as string) || 'charcoal') === c.id
                            return (
                              <button key={c.id} onClick={() => updateGallerySetting('themeColor', c.id)}
                                style={{
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                  padding: '10px 14px',
                                  border: `1px solid ${active ? textPrimary : border}`,
                                  background: active ? '#fff' : 'transparent',
                                  borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                                  transition: 'border-color .15s, background .15s',
                                }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: c.color,
                                }} />
                                <span style={{
                                  fontSize: 10, fontWeight: 500, color: textPrimary,
                                  letterSpacing: '0.04em',
                                }}>{c.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Grid — direction + thumb size + spacing ── */}
                    {designSubTab === 'grid' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        {([
                          {
                            key: 'gridDirection', defaultV: 'vertical',
                            eyebrow: 'כיוון תמונות',
                            opts: [
                              { id: 'vertical',   label: 'אנכי' },
                              { id: 'horizontal', label: 'אופקי' },
                            ],
                          },
                          {
                            key: 'thumbnailSize', defaultV: 'regular',
                            eyebrow: 'גודל תמונה ממוזערת',
                            opts: [
                              { id: 'regular', label: 'רגיל' },
                              { id: 'large',   label: 'גדול' },
                            ],
                          },
                          {
                            key: 'gridSpacing', defaultV: 'regular',
                            eyebrow: 'מרווח גריד',
                            opts: [
                              { id: 'regular', label: 'רגיל' },
                              { id: 'large',   label: 'מורווח' },
                            ],
                          },
                        ] as const).map(g => (
                          <div key={g.key}>
                            <div style={{ ...labelStyle }}>{g.eyebrow}</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {g.opts.map(o => {
                                const active = ((ds[g.key] as string) || g.defaultV) === o.id
                                return (
                                  <button key={o.id} onClick={() => updateGallerySetting(g.key, o.id)}
                                    style={{
                                      flex: 1, padding: '14px 16px',
                                      border: `1px solid ${active ? textPrimary : border}`,
                                      background: active ? '#fff' : 'transparent',
                                      borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                                      fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary,
                                      transition: 'border-color .15s, background .15s',
                                    }}>{o.label}</button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Navigation — top vs side ── */}
                    {designSubTab === 'nav' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
                          איך הניווט מופיע בגלריה הציבורית.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {([
                            { id: 'top',  label: 'ניווט עליון', desc: 'שורה אופקית בראש הגלריה' },
                            { id: 'side', label: 'ניווט צדדי', desc: 'סרגל קבוע בצד המסך' },
                          ] as const).map(n => {
                            const active = ((ds.navStyle as string) || 'top') === n.id
                            return (
                              <button key={n.id} onClick={() => updateGallerySetting('navStyle', n.id)}
                                style={tileStyle(active)}>
                                <Icon name={n.id === 'top' ? 'menu' : 'sections'} size={22} strokeWidth={active ? 1.85 : 1.4} />
                                <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary }}>{n.label}</div>
                                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4, textAlign: 'center' }}>{n.desc}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })()}
                </div>
              </div>
            </div>

            {/* ── New Photo Set modal — Pixieset-style: name + optional
                description, opens via the "+ Add Set" button in the sidebar. */}
            {showAddSetModal && (
              <div
                onClick={() => setShowAddSetModal(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 1100,
                  background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'overlayIn .2s ease both',
                }}>
                <div
                  ref={addSetRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="add-set-heading"
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: '#fff',
                    width: 'calc(100vw - 40px)', maxWidth: 480,
                    padding: '40px 40px 32px',
                    border: `1px solid ${border}`,
                    animation: 'modalIn .25s ease both',
                  }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 28,
                  }}>
                    <h3 id="add-set-heading" style={{
                      fontSize: 12, fontWeight: 500, margin: 0, color: textPrimary,
                      letterSpacing: '0.22em', textTransform: 'uppercase',
                    }}>New Photo Set</h3>
                    <button onClick={() => setShowAddSetModal(false)} aria-label="Close" style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: textSecondary, padding: 4, display: 'flex',
                    }}>
                      <Icon name="close" size={16} strokeWidth={1.85} />
                    </button>
                  </div>

                  <label style={{ display: 'block', marginBottom: 24 }}>
                    <span style={{
                      display: 'block', marginBottom: 8,
                      fontSize: 13, fontWeight: 500, color: textPrimary,
                    }}>Photo Set Name</span>
                    <input
                      autoFocus
                      type="text"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newSectionName.trim()) addSection() }}
                      placeholder="לדוגמה: טקס, קבלת פנים, הכנות"
                      style={{
                        width: '100%', padding: '12px 14px',
                        border: `1px solid ${border}`, borderRadius: 2,
                        background: '#fff', color: textPrimary,
                        fontSize: 14, fontFamily: 'inherit',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </label>

                  <label style={{ display: 'block', marginBottom: 28 }}>
                    <span style={{
                      display: 'block', marginBottom: 8,
                      fontSize: 13, fontWeight: 500, color: textPrimary,
                    }}>Description</span>
                    <textarea
                      value={newSectionDesc}
                      onChange={(e) => setNewSectionDesc(e.target.value.slice(0, 500))}
                      placeholder="אופציונלי"
                      rows={4}
                      style={{
                        width: '100%', padding: '12px 14px',
                        border: `1px solid ${border}`, borderRadius: 2,
                        background: '#fff', color: textPrimary,
                        fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{
                      marginTop: 6, fontSize: 11, color: textMuted,
                      letterSpacing: '0.04em',
                    }}>{newSectionDesc.length} / 500</div>
                  </label>

                  <p style={{
                    fontSize: 12, color: textSecondary, marginBottom: 24, lineHeight: 1.5,
                  }}>
                    התיאור מוצג ללקוחות שלך כשהם רואים את הקטע הזה — מצוין לסטוריטלינג.
                  </p>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowAddSetModal(false)} style={{
                      padding: '10px 22px', borderRadius: 2,
                      background: 'transparent', border: `1px solid ${border}`,
                      color: textPrimary, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                    }}>Cancel</button>
                    <button onClick={addSection} disabled={!newSectionName.trim()} style={{
                      padding: '10px 28px', borderRadius: 2,
                      background: newSectionName.trim() ? textPrimary : border,
                      border: `1px solid ${newSectionName.trim() ? textPrimary : border}`,
                      color: '#fff',
                      cursor: newSectionName.trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                    }}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/* ======= Download Tracking Section ======= */}
        {galleries.length > 0 && (
          <div style={{
            marginTop: 48, padding: 28, borderRadius: 18,
            background: card, border: `1px solid ${border}`,
            backdropFilter: 'blur(8px)',
            animation: 'fadeInUp .5s ease both .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  מעקב הורדות
                </h3>
                <p style={{ fontSize: 12, color: textMuted, margin: 0 }}>
                  צפו מי הוריד תמונות מהגלריות שלכם
                </p>
              </div>
              <span style={{
                padding: '6px 14px', borderRadius: 20,
                background: 'rgba(45,196,121,.08)', border: '1px solid rgba(45,196,121,.15)',
                fontSize: 11, color: accentLight, fontWeight: 600,
              }}>בקרוב</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
            }}>
              {[
                { email: 'demo@example.com', count: 24, date: '21.04.2026' },
                { email: 'guest@gmail.com', count: 12, date: '20.04.2026' },
                { email: 'couple@mail.com', count: 48, date: '19.04.2026' },
              ].map((d, i) => (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,.02)', border: `1px solid rgba(0,0,0,.03)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 2 }}>{d.email}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{d.date}</div>
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: accentLight,
                    background: 'rgba(45,196,121,.1)', padding: '4px 10px', borderRadius: 8,
                  }}>{d.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ======= Create gallery modal ======= */}
      {showModal && (() => {
        const inputBase = {
          width: '100%', padding: '12px 14px', borderRadius: 2,
          border: `1px solid ${border}`,
          background: '#fff', color: textPrimary, fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none', boxSizing: 'border-box' as const,
          transition: 'border-color .15s',
        }
        const labelStyle = {
          fontSize: 13, color: textPrimary, display: 'block' as const, marginBottom: 8,
          fontWeight: 500,
        }
        // Picker tile — uppercase eyebrow on selected, hairline-bordered, cream
        // background, no green/glow. Mirrors the editorial CTA language.
        const pickerTile = (selected: boolean) => ({
          background: selected ? bgSubtle : '#fff',
          border: `1px solid ${selected ? textPrimary : border}`,
          borderRadius: 2, padding: '18px 8px', cursor: 'pointer',
          display: 'flex' as const, flexDirection: 'column' as const,
          alignItems: 'center' as const, gap: 10,
          transition: 'border-color .15s, background .15s',
          fontFamily: 'inherit',
        })
        return (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(20,20,19,.55)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, animation: 'overlayIn .2s ease both',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            ref={newGalleryRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-gallery-heading"
            style={{
              background: bg,
              borderRadius: 4, padding: '40px 44px 36px', width: '90%', maxWidth: 560,
              maxHeight: '90vh', overflowY: 'auto' as const,
              border: `1px solid ${border}`, direction: 'rtl',
              animation: 'modalIn .3s ease both',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Eyebrow + close + heading — replaces the gradient block */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 18,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase',
              }}>
                New Gallery
              </div>
              <button onClick={() => setShowModal(false)} aria-label="סגירה" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: textSecondary, padding: 4, display: 'flex',
              }}>
                <Icon name="close" size={16} strokeWidth={1.85} />
              </button>
            </div>

            <h2 id="new-gallery-heading" style={{
              fontSize: 28, fontWeight: 500, margin: '0 0 10px',
              color: textPrimary, letterSpacing: '-0.02em', lineHeight: 1.1,
            }}>
              יצירת גלריה חדשה
            </h2>
            <p style={{ color: textSecondary, fontSize: 14, margin: '0 0 32px', lineHeight: 1.55 }}>
              מלאו את הפרטים כדי להתחיל
            </p>

            <label style={{ display: 'block', marginBottom: 22 }}>
              <span style={labelStyle}>שם הגלריה</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: החתונה של יוסי ומיכל"
                autoFocus
                style={inputBase}
                onFocus={(e) => { e.currentTarget.style.borderColor = textPrimary }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 28 }}>
              <span style={labelStyle}>תאריך אירוע</span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={inputBase}
                onFocus={(e) => { e.currentTarget.style.borderColor = textPrimary }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border }}
              />
            </label>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

            {/* ── Welcome Screen Style ── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase', marginBottom: 12,
              }}>
                סגנון מסך פתיחה
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'mosaic' as const,    label: 'פסיפס',    icon: 'sections' as IconName },
                  { value: 'cinematic' as const, label: 'קולנועי', icon: 'photo'    as IconName },
                  { value: 'minimal' as const,   label: 'מינימלי', icon: 'gallery'  as IconName },
                ] as const).map((opt) => {
                  const selected = welcomeStyle === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWelcomeStyle(opt.value)}
                      style={pickerTile(selected)}
                    >
                      <Icon name={opt.icon} size={20} strokeWidth={selected ? 1.85 : 1.4} />
                      <span style={{
                        fontSize: 12,
                        fontWeight: selected ? 600 : 500,
                        color: textPrimary, fontFamily: 'inherit',
                      }}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Feed Layout ── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase', marginBottom: 12,
              }}>
                תצוגת פיד
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'grid' as const,     label: 'רשת',     icon: 'gallery'  as IconName },
                  { value: 'masonry' as const,  label: 'אבן',     icon: 'sections' as IconName },
                  { value: 'carousel' as const, label: 'קרוסלה', icon: 'arrow-out' as IconName },
                ] as const).map((opt) => {
                  const selected = feedLayout === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFeedLayout(opt.value)}
                      style={pickerTile(selected)}
                    >
                      <Icon name={opt.icon} size={20} strokeWidth={selected ? 1.85 : 1.4} />
                      <span style={{
                        fontSize: 12,
                        fontWeight: selected ? 600 : 500,
                        color: textPrimary, fontFamily: 'inherit',
                      }}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

            {/* Face recognition toggle — separate from the privacy stack
                because turning it ON requires confirming the token cost first.
                Once enabled, a sub-picker for "open vs private" appears below. */}
            <div style={{ marginBottom: 18 }}>
              <div
                onClick={() => {
                  if (faceRecognition) {
                    setFaceRecognition(false)
                    setFacePrivacyMode('open')
                  } else {
                    setShowFaceConfirm(true)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none', gap: 12,
                }}
              >
                <div>
                  <span style={{
                    fontSize: 13, color: textPrimary, fontWeight: 500, display: 'block',
                    marginBottom: 4,
                  }}>
                    זיהוי פנים
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 24, padding: 2,
                  background: faceRecognition ? textPrimary : border,
                  transition: 'background .2s', flexShrink: 0,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: faceRecognition ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.18)',
                  }} />
                </div>
              </div>

              {/* Privacy mode sub-picker — appears only after face-rec is on */}
              {faceRecognition && (
                <div style={{
                  marginTop: 14, padding: 14,
                  background: bgSubtle, border: `1px solid ${border}`,
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                    color: textMuted, textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    מצב פרטיות
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { id: 'open' as const,    label: 'פתוח',  desc: 'כולם רואים את כל התמונות' },
                      { id: 'private' as const, label: 'פרטי',  desc: 'כל אורח רואה רק את התמונות שלו' },
                    ]).map(m => {
                      const selected = facePrivacyMode === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setFacePrivacyMode(m.id)}
                          style={{
                            background: selected ? '#fff' : 'transparent',
                            border: `1px solid ${selected ? textPrimary : border}`,
                            borderRadius: 2, padding: '12px 14px', cursor: 'pointer',
                            fontFamily: 'inherit', textAlign: 'right' as const,
                            transition: 'border-color .15s, background .15s',
                          }}
                        >
                          <div style={{
                            fontSize: 13, fontWeight: selected ? 600 : 500,
                            color: textPrimary, marginBottom: 4,
                          }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>
                            {m.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Toggle row helper — used for the three privacy switches below.
                Charcoal "on" state matches the editorial palette; no green. */}
            {([
              { key: 'hide',  on: clientHidePhotosEnabled, set: setClientHidePhotosEnabled,
                title: 'הסתרת תמונות',  desc: 'אפשרו לאורחים להסתיר תמונות מאורחים אחרים' },
              { key: 'code',  on: requireGalleryCode, set: setRequireGalleryCode,
                title: 'קוד גישה לגלריה', desc: 'דרשו קוד כניסה לצפייה בגלריה' },
              { key: 'track', on: trackDownloads, set: setTrackDownloads,
                title: 'מעקב הורדות',     desc: 'עקבו אחרי הורדות לפי אימייל' },
            ] as const).map((row, i, arr) => (
              <div key={row.key} style={{ marginBottom: i === arr.length - 1 ? 0 : 18 }}>
                <div
                  onClick={() => row.set(!row.on)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', userSelect: 'none', gap: 12,
                  }}
                >
                  <div>
                    <span style={{
                      fontSize: 13, color: textPrimary, fontWeight: 500, display: 'block',
                      marginBottom: 4,
                    }}>
                      {row.title}
                    </span>
                    <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                      {row.desc}
                    </span>
                  </div>
                  <div style={{
                    width: 44, height: 24, borderRadius: 24, padding: 2,
                    background: row.on ? textPrimary : border,
                    transition: 'background .2s', flexShrink: 0,
                    cursor: 'pointer', position: 'relative',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 10,
                      background: '#fff',
                      transition: 'transform .2s',
                      transform: row.on ? 'translateX(-20px)' : 'translateX(0)',
                      boxShadow: '0 1px 3px rgba(0,0,0,.18)',
                    }} />
                  </div>
                </div>
                {row.key === 'code' && row.on && (
                  <input
                    type="text"
                    value={galleryCode}
                    onChange={(e) => setGalleryCode(e.target.value)}
                    placeholder="הזינו קוד גישה"
                    style={{ ...inputBase, marginTop: 10 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = textPrimary }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = border }}
                  />
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 32, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'transparent', color: textPrimary,
                  border: `1px solid ${border}`,
                  borderRadius: 2, padding: '12px 24px', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'border-color .15s',
                  letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = textPrimary }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = border }}
              >
                Cancel
              </button>
              <button
                onClick={createGallery}
                disabled={creating || !newName.trim()}
                style={{
                  background: !newName.trim() || creating ? border : textPrimary,
                  color: '#fff', border: `1px solid ${!newName.trim() || creating ? border : textPrimary}`,
                  borderRadius: 2, padding: '12px 32px', fontSize: 11, fontWeight: 500,
                  cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                }}
              >
                {creating ? (
                  <>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.4)', borderTopColor: '#fff', animation: 'spin .6s linear infinite' }} />
                    Creating
                  </>
                ) : 'Create Gallery'}
              </button>
            </div>
          </div>

          {/* Face recognition confirm dialog — explains the token cost
              and opt-in nature before flipping the switch on. Stops modal
              click-through so dismissing only the inner dialog returns the
              user to the create-gallery form. */}
          {showFaceConfirm && (
            <div
              onClick={(e) => { e.stopPropagation(); setShowFaceConfirm(false) }}
              style={{
                position: 'fixed', inset: 0, zIndex: 1100,
                background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'overlayIn .2s ease both',
              }}>
              <div
                ref={faceConfirmRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="face-confirm-heading"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#fff', width: 'calc(100vw - 40px)', maxWidth: 460,
                  padding: '36px 40px 32px',
                  border: `1px solid ${border}`,
                  animation: 'modalIn .25s ease both',
                }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase', marginBottom: 14,
                }}>
                  Heads up
                </div>
                <h3 id="face-confirm-heading" style={{
                  fontSize: 22, fontWeight: 500, margin: '0 0 14px',
                  color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.15,
                }}>
                  זיהוי פנים — איך זה עובד
                </h3>
                <p style={{
                  color: textSecondary, fontSize: 14, lineHeight: 1.65, margin: '0 0 14px',
                }}>
                  כל תמונה שתעלה לגלריה זו תאונדקס במנוע זיהוי פנים. אורחים יצלמו סלפי וימצאו את התמונות שלהם תוך שניות.
                </p>
                <p style={{
                  color: textSecondary, fontSize: 14, lineHeight: 1.65, margin: '0 0 24px',
                }}>
                  <strong style={{ color: textPrimary, fontWeight: 600 }}>עלות:</strong>{' '}
                  ללא תוספת טוקנים — נשאר <strong style={{ color: textPrimary }}>1 טוקן לתמונה</strong>. יתרת הטוקנים שלך כרגע: <strong style={{ color: textPrimary }}>{tokenBalance.toLocaleString('he-IL')}</strong>.
                </p>
                <div style={{
                  padding: '12px 14px', background: bgSubtle,
                  border: `1px solid ${border}`, marginBottom: 24,
                  fontSize: 12, color: textSecondary, lineHeight: 1.55,
                }}>
                  ההעלאה תהיה איטית מעט יותר כי כל תמונה עוברת אינדוקס. אפשר להפעיל ולהשבית בכל רגע.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowFaceConfirm(false)}
                    style={{
                      background: 'transparent', color: textPrimary,
                      border: `1px solid ${border}`,
                      borderRadius: 2, padding: '11px 22px', fontSize: 11, cursor: 'pointer',
                      fontFamily: 'inherit',
                      letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
                    }}
                  >Cancel</button>
                  <button
                    onClick={() => { setFaceRecognition(true); setShowFaceConfirm(false) }}
                    style={{
                      background: textPrimary, color: '#fff',
                      border: `1px solid ${textPrimary}`,
                      borderRadius: 2, padding: '11px 26px', fontSize: 11, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 500,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                    }}
                  >Enable</button>
                </div>
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* ───────────── Email Share Modal ───────────── */}
      {shareGallery && (
        <div
          onClick={() => !shareSending && setShareGallery(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2100,
            background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'overlayIn .2s ease both',
          }}
        >
          <div
            ref={shareModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-share-heading"
            onClick={e => e.stopPropagation()}
            style={{
              background: bg, width: '100%', maxWidth: 520,
              borderRadius: 22, padding: 32,
              border: `1px solid ${border}`,
              animation: 'modalIn .3s ease both',
              boxShadow: '0 30px 100px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <h2 id="email-share-heading" style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                שלח קישור במייל
              </h2>
              <button onClick={() => setShareGallery(null)} disabled={shareSending} aria-label="סגירה" style={{
                background: 'transparent', border: 'none', color: textMuted, fontSize: 20,
                cursor: shareSending ? 'not-allowed' : 'pointer', lineHeight: 1, padding: 4,
                opacity: shareSending ? 0.5 : 1,
              }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: textSecondary, margin: '0 0 22px', lineHeight: 1.5 }}>
              שולח לכתובת המייל קישור לגלריה <strong>{shareGallery.name}</strong>. הלקוח יקבל מייל ממותג עם הקישור הציבורי.
            </p>

            {shareSent ? (
              <div style={{
                padding: '32px 20px', textAlign: 'center',
                background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)',
                borderRadius: 14, color: '#4ade80',
              }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>המייל נשלח</div>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ display: 'block', fontSize: 12, color: textMuted, marginBottom: 6, fontWeight: 600 }}>
                    כתובת מייל של הלקוח
                  </span>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={e => setShareEmail(e.target.value)}
                    placeholder="client@example.com"
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10,
                      background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
                      color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                      direction: 'ltr', textAlign: 'left',
                    }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ display: 'block', fontSize: 12, color: textMuted, marginBottom: 6, fontWeight: 600 }}>
                    נושא
                  </span>
                  <input
                    type="text"
                    value={shareSubject}
                    onChange={e => setShareSubject(e.target.value)}
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10,
                      background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
                      color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 24 }}>
                  <span style={{ display: 'block', fontSize: 12, color: textMuted, marginBottom: 6, fontWeight: 600 }}>
                    הודעה אישית (אופציונלי)
                  </span>
                  <textarea
                    value={shareMessage}
                    onChange={e => setShareMessage(e.target.value)}
                    rows={3}
                    placeholder="תודה רבה על האירוע! תהנו מהתמונות..."
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10,
                      background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
                      color: textPrimary, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                      resize: 'vertical', minHeight: 80,
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShareGallery(null)}
                    disabled={shareSending}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 12,
                      background: 'transparent', color: textSecondary,
                      border: `1px solid ${border}`, fontSize: 14, fontWeight: 600,
                      cursor: shareSending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: shareSending ? 0.5 : 1,
                    }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={sendShareEmail}
                    disabled={shareSending || !shareEmail}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 12,
                      background: shareSending || !shareEmail
                        ? 'rgba(45,196,121,.4)'
                        : `linear-gradient(135deg, ${accent}, ${accentLight})`,
                      color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
                      cursor: shareSending || !shareEmail ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all .15s',
                    }}
                  >
                    {shareSending ? 'שולח...' : 'שלח'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ───────────── Buy Tokens Modal ───────────── */}
      {showBuyTokens && (
        <div
          onClick={() => setShowBuyTokens(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'overlayIn .2s ease both',
          }}
        >
          <div
            ref={buyTokensRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="buy-tokens-heading"
            onClick={e => e.stopPropagation()}
            style={{
              background: bg, width: '100%', maxWidth: 720,
              borderRadius: 24, padding: 36,
              border: `1px solid ${border}`,
              animation: 'modalIn .3s ease both',
              boxShadow: '0 30px 100px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h2 id="buy-tokens-heading" style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                קנה טוקנים
              </h2>
              <button onClick={() => setShowBuyTokens(false)} aria-label="סגירה" style={{
                background: 'transparent', border: 'none', color: textMuted, fontSize: 22,
                cursor: 'pointer', lineHeight: 1, padding: 4,
              }}>×</button>
            </div>
            <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 24px', lineHeight: 1.5 }}>
              טוקן אחד = העלאת תמונה אחת. יתרה נוכחית: <strong style={{ color: tokenBalance < 50 ? '#fca5a5' : '#16a274' }}>{tokenBalance.toLocaleString('he-IL')}</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {TOKEN_PACKAGES.map(pkg => (
                <button
                  key={pkg.planId}
                  onClick={async () => {
                    const url = await startCheckout(pkg.planId)
                    if (url) { window.location.href = url }
                    else { alert('שגיאה בפתיחת תשלום. נסה שוב.') }
                  }}
                  style={{
                    position: 'relative',
                    background: pkg.highlight
                      ? `linear-gradient(135deg, rgba(45,196,121,.12), rgba(61,214,139,.06))`
                      : card,
                    border: `1px solid ${pkg.highlight ? 'rgba(45,196,121,.4)' : border}`,
                    borderRadius: 18, padding: 24, textAlign: 'right' as const,
                    cursor: 'pointer', transition: 'all .2s',
                    color: textPrimary, fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(45,196,121,.18)` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  {pkg.highlight && (
                    <div style={{
                      position: 'absolute', top: -10, right: 16,
                      padding: '4px 12px', borderRadius: 10,
                      background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
                      fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
                    }}>
                      {pkg.highlight}
                    </div>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{pkg.name}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>
                    {pkg.tokens.toLocaleString('he-IL')}
                  </div>
                  <div style={{ fontSize: 12, color: textMuted, marginBottom: 12 }}>טוקנים בחודש</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16a274' }}>
                    ₪{pkg.pricePerMonthIls}
                    <span style={{ fontSize: 12, fontWeight: 500, color: textMuted }}> / חודש</span>
                  </div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, color: textMuted, margin: '20px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
              חיוב חודשי דרך LemonSqueezy. אפשר לבטל בכל זמן.<br />
              טוקנים שלא בשימוש מצטברים, לא מתאפסים בסוף חודש.
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
