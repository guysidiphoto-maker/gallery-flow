import React, { useState, useEffect, useRef, useMemo } from 'react'
import { FixedSizeGrid, type GridChildComponentProps } from 'react-window'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { supabase, storageUrl } from '../supabase'
import { uploadMany } from '../lib/uploadPipeline'
import { signedStorageUrl } from '../lib/signedStorage'
import { warmGalleryCache } from '../lib/warmCache'
import { SignedImg } from '../components/SignedImg'
import { getMyTokenBalance, startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { Icon, type IconName } from '../components/Icon'
import { LocalGalleryPreview } from '../components/LocalGalleryPreview'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useToast } from '../components/Toast'
import { validateDeliverySettingsPatch, summarizeValidationErrors } from '../lib/deliverySettingsSchema'
import { Viewer } from '../Viewer'
import { useConfirm } from '../components/useConfirm'
import { setSentryUser, trackAction } from '../lib/sentryContext'
import {
  exportGalleryAsZip,
  ExportCapExceededError,
  type ExportProgress,
} from '../lib/galleryExport'
import {
  requestStoryGeneration,
  pollStoryRender,
  type StoryStyle,
  STORY_STYLES,
  STORY_DEFAULT_PHOTO_BUDGET,
  STORY_MIN_PHOTOS,
  STORY_MAX_PHOTOS,
  estimateRenderSeconds,
  formatStoryDuration,
} from '../lib/storyRender'
import { applyBrandKitToGalleryDefaults, getBrandKit } from '../lib/brandKit'

// Mirrors the postgres enum gallery_status (migration 063).
type GalleryStatus = 'draft' | 'live' | 'archived'

// Stories Phase 1 — bounds for the "Generate story" CTA. The Remotion clean
// composition needs ~12 photos for a coherent ~30s clip and caps at 60 so a
// 4000-photo gallery can't queue a runaway Lambda render.
const STORY_GENERATE_MIN_PHOTOS = STORY_MIN_PHOTOS
const STORY_GENERATE_MAX_PHOTOS = STORY_MAX_PHOTOS

interface Gallery {
  id: string
  name: string
  slug?: string | null
  image_count: number
  published_at: string | null
  status: GalleryStatus
  delivery_settings?: Record<string, unknown>
  download_count?: number
  favorite_count?: number
  // Mirrors the galleries.face_index_enabled column. Stored alongside the
  // legacy delivery_settings.faceIndexEnabled JSONB key — the column is the
  // canonical source for the rekognition RPC, JSONB for the public viewer.
  face_index_enabled?: boolean | null
}

interface GalleryImage {
  id: string
  filename: string
  storage_path: string
  thumbnail_path: string | null
  // Phase 4.2 originals-only model — the HD source object in
  // `gallery-images`. Selected alongside the preview/thumb paths so that
  // delete flows can purge ALL three storage objects for an image, not
  // just the row. Nullable because pre-Phase-4.2 rows may not have one.
  original_path?: string | null
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
       toggles it; a backdrop dims the rest.

       Use logical inset (inset-inline-end) + translate by 100% — under
       direction: rtl, translateX(100%) flips to LEFT, which moves the drawer
       INTO view (the inverse of what we want). The translate value below uses
       the keyword "100%" on a transformed offset that is direction-aware via
       writing-mode-neutral logical property fallbacks; cleaner: just use a
       conditional class that swaps the offscreen position to the inline end. */
    @media (max-width: 900px) {
      .dash-sidebar {
        position: fixed !important;
        inset-inline-end: 0 !important;
        top: 0 !important;
        height: 100vh !important;
        /* Hide off-canvas by translating away from the inline-end edge. In RTL
           this is to the right (positive X); in LTR to the left (negative X).
           Using a CSS custom property keeps it direction-aware in one place. */
        --dash-drawer-hide: translateX(100%);
        transform: var(--dash-drawer-hide);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
        box-shadow: -8px 0 32px rgba(0,0,0,.4);
      }
      [dir="rtl"] .dash-sidebar { --dash-drawer-hide: translateX(-100%); }
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

/** Compact Hebrew progress label for the in-button status on the gallery
 *  export action. Mirrors the phases reported by exportGalleryAsZip. */
function exportProgressLabel(p: ExportProgress): string {
  switch (p.phase) {
    case 'metadata':
      return 'טוען נתונים...'
    case 'downloading':
      return `מוריד ${p.current} / ${p.total}...`
    case 'zipping':
      return `יוצר ZIP ${p.current}%...`
    case 'saving':
      return 'שומר קובץ...'
    default:
      return 'מייצא...'
  }
}

export function Dashboard() {
  const { user, loading } = useAuth()
  const { showToast, ToastContainer } = useToast()
  // Promise-based replacement for native window.confirm(). Render
  // <ConfirmHost /> near the root and call `await confirm({…})` from any
  // destructive handler. See gallery-web/src/components/useConfirm.ts.
  const { confirm, ConfirmHost } = useConfirm()
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
  // Memoized delivery_settings projection — the editor tabs read `ds.foo` in
  // dozens of places, and without a memo every render created a fresh object
  // reference (defeating downstream React.memo / useMemo deps and adding
  // GC pressure on every keystroke). Keyed off the underlying JSONB so the
  // identity only changes when the photographer's edits actually land.
  const editorDs = useMemo(
    () => (editingGallery?.delivery_settings ?? {}) as Record<string, unknown>,
    [editingGallery?.delivery_settings],
  )
  // 'sections' removed (was a redundant editor tab — sections live in the
  // Photos-tab sidebar). 'preview' is Phase 5's Live Preview iframe.
  const [editTab, setEditTab] = useState<'photos' | 'settings' | 'activities' | 'welcome' | 'stories' | 'preview'>('photos')
  // Live Preview pane — previously an iframe whose src embedded a cache-buster
  // (`?v=N`) that we bumped on every save to force a full document reload.
  // That round trip (HTML + JS + CSS + every image from the CDN, then App.tsx
  // re-mount + Supabase re-fetch) was the dominant cause of the "type a
  // character, wait a second, character appears in preview" lag. The pane is
  // now an in-process React component (LocalGalleryPreview) that reads from
  // `editingGallery` / `sections` / `galleryImages` state — re-rendering it
  // costs ~1 ms instead of a full network round trip. `unpublishedChanges`
  // is still used to label the pane "תצוגה מקומית · לא מעודכן מהפרסום" so
  // the photographer knows what they see is unsaved local state.
  const [unpublishedChanges, setUnpublishedChanges] = useState(false)
  // Inline side-by-side preview pane — visible alongside Settings + Welcome
  // tabs so every config tweak reflects live in the iframe without tab-
  // switching. Default ON; a toggle in the header collapses it for full-
  // width editing when needed.
  const [showSidePreview, setShowSidePreview] = useState(true)
  // In-flight + just-published states for the Publish/Update button so a click
  // gives immediate visual feedback (was: silent black button → toast 200ms
  // later, easy to miss). `publishing` flips true during the await; `justPublished`
  // briefly shows a confirmation label that auto-dismisses.
  const [publishing, setPublishing] = useState(false)
  const [justPublished, setJustPublished] = useState(false)
  // Inline confirmation for the Copy Link button — the toast is great but
  // the eye is already on the button at the moment of click. Mirrors the
  // copy-link pattern on the gallery list cards.
  const [copiedInEditor, setCopiedInEditor] = useState(false)
  // Called by every mutation that changes what the client sees (sections,
  // photo order, uploads, top-picks, deletes, stories, …). Lights up the
  // "שינויים שטרם פורסמו" pill + Update button. The local preview already
  // re-renders automatically from the same React state, so we no longer
  // need to schedule an iframe reload.
  const markDirty = () => {
    setUnpublishedChanges(true)
  }
  // Multi-key variant of updateGallerySetting — used when one user action
  // logically writes several keys at once (e.g. cover selection writing both
  // the canonical storage path and the legacy URL fallback in the same patch).
  // One DB round-trip, one optimistic UI update, one rollback path.
  async function updateGallerySettings(patch: Record<string, unknown>) {
    if (!editingGallery) return
    const prevSettings = editingGallery.delivery_settings || {}
    const nextSettings = { ...prevSettings, ...patch }
    setEditingGallery({ ...editingGallery, delivery_settings: nextSettings })
    markDirty()
    const { error } = await supabase
      .from('galleries')
      .update({ delivery_settings: nextSettings })
      .eq('id', editingGallery.id)
    if (error) {
      setEditingGallery(g => g && g.id === editingGallery.id
        ? { ...g, delivery_settings: prevSettings } : g)
      showToast({ kind: 'error', text: 'שמירת ההגדרה נכשלה. נסה שוב.' })
      console.warn('[updateGallerySettings]', patch, error)
    }
  }
  const [sections, setSections] = useState<Array<{ id: string; name: string; sort_order: number; description?: string | null }>>([])
  const [newSectionName, setNewSectionName] = useState('')
  const [newSectionDesc, setNewSectionDesc] = useState('')
  // Sidebar Set behavior: the active section (null only for an empty gallery
  // with no sections yet), inline-rename target, and the "+ Add Set" modal
  // toggle. Every photo belongs to a section — there is no "all photos" view.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null)
  // Inline edit state for the active section's description (shown above the
  // photo grid). null = not editing; otherwise the section id being edited.
  const [editingSectionDescId, setEditingSectionDescId] = useState<string | null>(null)
  const [sectionDescDraft, setSectionDescDraft] = useState('')
  // Controlled draft for the section-rename input — replaces the prior
  // uncontrolled defaultValue, which couldn't tell "user typed garbage then
  // hit Escape" from "user typed a real value then blurred". The cancel ref
  // is consulted by onBlur so Escape can short-circuit the save.
  const [sectionRenameDraft, setSectionRenameDraft] = useState('')
  const sectionRenameCancelledRef = useRef(false)
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
  // Lightbox state — opens when the photographer clicks a photo (outside of
  // select mode). Snapshotted at click time so next/prev stays scoped to the
  // active section's grid even if state changes mid-view.
  const [viewerImages, setViewerImages] = useState<GalleryImage[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number>(0)
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
  // Section drag-reorder — mirrors the image-tile pattern but operates on the
  // sidebar section list. Sort order persists to gallery_sections.sort_order
  // and the row order updates optimistically as the user drags.
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [sectionDragOverId, setSectionDragOverId] = useState<string | null>(null)
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
  // Stories Phase 1 — automated generation. The CTA opens a small modal so
  // the photographer picks a style (only "clean" exists today; Phase 2
  // widens this). `storyGenerating` flips while the POST is in flight so we
  // can disable the button and avoid double-fires. The min-photos gate keeps
  // 4-photo galleries from getting a clip that looks like a slideshow.
  const STORY_GENERATE_MIN_PHOTOS = 12
  const [showStoryStyleModal, setShowStoryStyleModal] = useState(false)
  const [storyGenStyle, setStoryGenStyle] = useState<StoryStyle>('clean')
  const [storyGenerating, setStoryGenerating] = useState(false)
  // Curated shot list for the story. null = use defaults (favorites if any,
  // else first 30). When the photographer touches the curator (remove, drag,
  // add) this becomes an explicit ordered list of image ids.
  const [storyCandidateIds, setStoryCandidateIds] = useState<string[] | null>(null)
  const [storyShowAddPicker, setStoryShowAddPicker] = useState(false)
  const [storyDraggedId, setStoryDraggedId] = useState<string | null>(null)
  const [storyDragOverId, setStoryDragOverId] = useState<string | null>(null)
  // Stories Phase 2 — polling refs. setTimeout id + the render we're polling
  // for; mutated by the poll loop and cleared on cancel / unmount so we
  // don't leak timers across gallery switches.
  const storyPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const storyPollRenderIdRef = useRef<string | null>(null)

  // Stories Phase 1 uses the existing dashboard-wide useToast() instance
  // declared near the top of the component (line ~143) — no separate hook.

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

  // ── Gallery export (portable ZIP) ──────────────────────────────────────────
  // Photographer-driven backup: button lives in the Settings tab and pulls
  // every original through the browser, zips it with metadata.json, and
  // triggers a download. `exporting` doubles as the disable-flag; the
  // progress object drives the in-button status text.
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)

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

  // Pin the authenticated photographer onto every Sentry event captured for
  // the remainder of the session. Previously every dashboard crash arrived
  // anonymous and we had to cross-reference timestamps to guess who hit it.
  useEffect(() => {
    if (!user) return
    setSentryUser({ id: user.id, email: user.email ?? undefined })
  }, [user?.id, user?.email])

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

  // Stories Phase 2 — cancel any in-flight render poll when the editor
  // closes or the user switches to another gallery. We can't put this inside
  // handleGenerateStoryConfirm because the React closure there is gone by
  // the time the editor unmounts.
  useEffect(() => {
    if (!editingGallery) {
      if (storyPollTimerRef.current) {
        clearInterval(storyPollTimerRef.current)
        storyPollTimerRef.current = null
      }
      storyPollRenderIdRef.current = null
    }
    return () => {
      if (storyPollTimerRef.current) {
        clearInterval(storyPollTimerRef.current)
        storyPollTimerRef.current = null
      }
      storyPollRenderIdRef.current = null
    }
  }, [editingGallery?.id])

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
      .select('id, name, slug, image_count, published_at, status, download_count, favorite_count, delivery_settings')
      .eq('business_id', bId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch galleries error:', error)
    setGalleries(data ?? [])
    setLoadingGalleries(false)
  }

  async function createGallery() {
    if (!newName.trim()) return
    if (!businessId) {
      console.warn('[createGallery] missing businessId')
      showToast({ kind: 'error', text: 'שגיאה: לא נמצא חשבון עסקי. נסו לרענן את הדף.' })
      return
    }
    setCreating(true)
    // Brand Kit projection — when the photographer has set apply_to_galleries
    // in /brand-kit, brandDefaults carries studioName / logoUrl / welcomeMessage
    // pulled from their central identity. The spread order below lets per-
    // gallery defaults still win over brand defaults if they're non-empty.
    const brand = await getBrandKit(businessId)
    const brandDefaults = applyBrandKitToGalleryDefaults(brand)
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
        ...brandDefaults,
      },
    })
    setCreating(false)
    if (error) {
      console.warn('[createGallery]', error)
      showToast({ kind: 'error', text: `שגיאה ביצירת גלריה: ${error.message}` })
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
    // Reset Live Preview dirty flag per gallery so opening a second gallery
    // in the same session doesn't inherit the previous one's "unpublished
    // changes" state. The local preview re-renders automatically.
    setUnpublishedChanges(false)
    const [imagesRes, sectionsRes, storiesRes] = await Promise.all([
      supabase
        .from('images')
        .select('id, filename, storage_path:web_preview_path, thumbnail_path, original_path, is_top_pick, sort_order, section_id')
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('gallery_sections')
        .select('id, name, sort_order, description')
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
    const imgs = imagesRes.data ?? []
    let secs = sectionsRes.data ?? []

    // New model: every photo belongs to a section (no "all photos" catch-all).
    // Self-heal legacy/loose photos — any image without a section gets folded
    // into the first section (creating one if the gallery has none) so nothing
    // is hidden now that the All-Photos view is gone.
    const loose = imgs.filter(i => i.section_id == null)
    if (loose.length > 0) {
      let target = secs[0]
      if (!target) {
        const { data } = await supabase
          .from('gallery_sections')
          .insert({ gallery_id: g.id, name: 'סקשן 1', sort_order: 0 })
          .select('id, name, sort_order, description')
          .single()
        if (data) { secs = [data]; target = data }
      }
      if (target) {
        await supabase.from('images')
          .update({ section_id: target.id })
          .eq('gallery_id', g.id)
          .is('section_id', null)
        loose.forEach(i => { i.section_id = target!.id })
      }
    }

    setGalleryImages(imgs)
    setSections(secs)
    setActiveSectionId(secs[0]?.id ?? null)
    setStories(storiesRes.data ?? [])
  }

  async function addSection() {
    if (!editingGallery || !newSectionName.trim()) return
    const trimmedDesc = newSectionDesc.trim()
    const { data, error } = await supabase
      .from('gallery_sections')
      .insert({
        gallery_id: editingGallery.id,
        name: newSectionName.trim(),
        description: trimmedDesc || null,
        sort_order: sections.length,
      })
      .select('id, name, sort_order, description')
      .single()
    if (error) {
      showToast({ kind: 'error', text: 'יצירת הסקשן נכשלה. נסה שוב.' })
      console.warn('[addSection]', error)
      return
    }
    if (data) setSections(prev => [...prev, data])
    markDirty()
    setNewSectionName('')
    setNewSectionDesc('')
    setShowAddSetModal(false)
    if (data) setActiveSectionId(data.id)
  }

  // Every upload belongs to a section — there is no "all photos" catch-all.
  // If no section is active yet (e.g. a brand-new gallery), create a default
  // one on the fly so the first upload still works without forcing the user
  // to make a set first. Returns the section the new photos should land in.
  async function ensureUploadSection(): Promise<string | null> {
    if (activeSectionId) return activeSectionId
    if (!editingGallery) return null
    const { data, error } = await supabase
      .from('gallery_sections')
      .insert({
        gallery_id: editingGallery.id,
        name: `סקשן ${sections.length + 1}`,
        sort_order: sections.length,
      })
      .select('id, name, sort_order, description')
      .single()
    if (error) {
      showToast({ kind: 'error', text: 'יצירת הסקשן נכשלה. נסה שוב.' })
      console.warn('[ensureUploadSection]', error)
      return null
    }
    setSections(prev => [...prev, data])
    setActiveSectionId(data.id)
    return data.id
  }

  async function renameSection(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    trackAction('section', 'rename', { section_id: id })
    const { error } = await supabase.from('gallery_sections').update({ name: trimmed }).eq('id', id)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[renameSection]', error)
      return
    }
    setSections(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s))
    markDirty()
  }

  // Inline-edit the description from the active section's header. Saves on
  // blur / Enter. Empty string is persisted as null (no description).
  async function saveSectionDescription(id: string, raw: string) {
    const trimmed = raw.trim()
    const prev = sections.find(s => s.id === id)?.description ?? null
    const next = trimmed.length === 0 ? null : trimmed
    if (next === prev) return
    setSections(prevList => prevList.map(s => s.id === id ? { ...s, description: next } : s))
    markDirty()
    const { error } = await supabase
      .from('gallery_sections')
      .update({ description: next })
      .eq('id', id)
    if (error) {
      setSections(prevList => prevList.map(s => s.id === id ? { ...s, description: prev } : s))
      showToast({ kind: 'error', text: 'שמירת התיאור נכשלה.' })
      console.warn('[saveSectionDescription]', error)
    }
  }

  async function deleteSection(id: string) {
    if (!editingGallery) return
    // Each section is a self-contained gallery: deleting it permanently
    // deletes every photo inside it (matching bulkDeleteSelected's row-delete
    // + image_count update). Photos are NOT moved elsewhere.
    const section = sections.find(s => s.id === id)
    const photosToDelete = galleryImages.filter(i => i.section_id === id)
    const photoIds = photosToDelete.map(i => i.id)
    if (!(await confirm({
      title: `למחוק את הסקשן "${section?.name ?? ''}"?`,
      body: photoIds.length > 0
        ? `${photoIds.length} תמונות יימחקו לצמיתות. לא ניתן לבטל.`
        : undefined,
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    if (photoIds.length > 0) {
      const { error: imgErr } = await supabase.from('images').delete().in('id', photoIds)
      if (imgErr) {
        showToast({ kind: 'error', text: 'שגיאה במחיקת התמונות: ' + imgErr.message })
        return
      }
      // Fire-and-forget storage purge for the section's photos.
      void purgeStorageForImages(photosToDelete)
    }
    const { error } = await supabase.from('gallery_sections').delete().eq('id', id)
    if (error) { alert('שגיאה: ' + error.message); return }
    setGalleryImages(prev => prev.filter(i => i.section_id !== id))
    setSections(prev => prev.filter(s => s.id !== id))
    if (activeSectionId === id) {
      setActiveSectionId(sections.find(s => s.id !== id)?.id ?? null)
    }
    markDirty()
    if (photoIds.length > 0) {
      await supabase.from('galleries')
        .update({ image_count: Math.max(0, galleryImages.length - photoIds.length) })
        .eq('id', editingGallery.id)
    }
    fetchGalleries()
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !editingGallery || !businessId || !businessSlug) return
    if (tokenBalance < files.length) {
      const wanted = files.length
      const have = tokenBalance
      showToast({ kind: 'error', text: `אין מספיק טוקנים. צריך ${wanted}, יש לך ${have}. רכוש חבילה כדי להמשיך.` })
      setShowBuyTokens(true)
      return
    }
    // Photos land in the active section (or a freshly-created default one).
    const targetSectionId = await ensureUploadSection()
    setUploading(true)
    setUploadBatch({ completed: 0, total: files.length, failed: 0 })
    const result = await uploadMany(
      Array.from(files),
      {
        galleryId: editingGallery.id,
        businessSlug,
        sectionId: targetSectionId,
        sortOrder: galleryImages.length,
      },
      (b) => setUploadBatch(b),
      8,
    )
    if (result.failed.length > 0) {
      const insufficient = result.failed.find(f => f.error.includes('insufficient_tokens'))
      if (insufficient) {
        showToast({ kind: 'error', text: 'הטוקנים נגמרו באמצע ההעלאה. רכוש חבילה כדי להמשיך עם השאר.' })
        setShowBuyTokens(true)
      } else {
        showToast({ kind: 'error', text: `${result.failed.length} תמונות נכשלו. השאר עלו בהצלחה.` })
      }
    }
    // Refresh balance + image list
    fetchTokenBalance()
    const { data } = await supabase
      .from('images')
      .select('id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick, sort_order, section_id')
      .eq('gallery_id', editingGallery.id)
      .order('sort_order', { ascending: true })
    setGalleryImages(data ?? [])
    setUploading(false)
    setUploadBatch(null)
    if (result.ok.length > 0) markDirty()

    // Breadcrumb after batch so a crash in the post-upload refresh / face
    // reindex carries the count of photos that were just uploaded.
    trackAction('upload', 'photo', {
      count: files.length,
      ok: result.ok.length,
      failed: result.failed.length,
      gallery_id: editingGallery.id,
    })

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
    if (files.length > 1) {
      // Owner picked multiple files in the native picker; we only render one
      // story at a time today (server-side generation lands in a later phase).
      // Tell the photographer instead of silently dropping the rest.
      showToast({ kind: 'info', text: `מעלה את הקובץ הראשון בלבד (${file.name}). העלאה מרובה תתווסף עם יצירת הסטוריז האוטומטית.` })
    }
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      showToast({ kind: 'error', text: 'יש להעלות קובץ MP4 בלבד.' })
      return
    }
    if (file.size > STORY_MAX_BYTES) {
      showToast({ kind: 'error', text: `הקובץ גדול מדי. המקסימום הוא ${Math.round(STORY_MAX_BYTES / 1024 / 1024)}MB.` })
      return
    }

    // Breadcrumb at the point the user kicks off a story (manual upload is
    // the web dashboard's analog of the desktop "generate story" action —
    // both end up at the same storage path / row in `stories`).
    trackAction('story', 'generate_request', {
      gallery_id: editingGallery.id,
      file_size: file.size,
      file_type: file.type,
    })

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
      showToast({ kind: 'error', text: 'שגיאה בהעלאה: ' + uploadErr.message })
      console.warn('[handleStoryUpload]', uploadErr)
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
      showToast({ kind: 'error', text: 'שגיאה בשמירת הסטורי: ' + (insertErr?.message ?? 'unknown') })
      console.warn('[story-insert]', insertErr)
      return
    }

    setStories(prev => [...prev, inserted])
    setStoryUploadProgress({ pct: 100, filename: file.name })
    setStoryUploading(false)
    markDirty()
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
    markDirty()

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
      console.warn('[handleStoryDelete]', dbErr)
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + dbErr.message })
    }
  }

  // ── Settings writers (Phase 6 Step 4) ───────────────────────────────────────
  // Both writers go through the `update_gallery_settings` RPC. The RPC is the
  // only path the DB allows for delivery_settings writes (direct column UPDATE
  // is revoked in migration 069), so even if a future caller forgets to
  // pre-validate, the server-side mirror catches drift like the legacy
  // `coverImageURL` vs `coverImageUrl` typo that fueled Phase 6.
  //
  // Optimistic update + rollback: we apply the patch locally before the
  // round-trip, then reconcile with the RPC's returned `delivery_settings`
  // (which is the post-merge JSONB) so client and server are byte-identical.
  // On validation error we roll back and toast the first few errors.
  async function updateGallerySetting(key: string, value: unknown) {
    if (!editingGallery) return
    // Phase 6 step 4 prep — pre-validate against the shared schema before
    // any DB round-trip. The server RPC will re-validate, but doing it here
    // first catches typos / out-of-range values without burning a network
    // round-trip and gives the photographer an immediate, specific message.
    const validation = validateDeliverySettingsPatch({ [key]: value })
    if (!validation.ok) {
      showToast({ kind: 'error', text: summarizeValidationErrors(validation.errors) })
      console.warn('[updateGallerySetting] validation failed', validation.errors)
      return
    }
    const prevSettings = editingGallery.delivery_settings || {}
    const nextSettings = { ...prevSettings, [key]: value }
    // Optimistic on three fronts so the UI feels live:
    //   1. local editingGallery.delivery_settings shows the new value,
    //   2. the Update button activates the moment the user starts editing
    //      (was waiting for the DB ack — 200-500ms of "dead" button),
    //   3. the local LocalGalleryPreview re-renders for free off the same
    //      React state — no iframe reload, no network.
    setEditingGallery({ ...editingGallery, delivery_settings: nextSettings })
    setUnpublishedChanges(true)
    const { error } = await supabase
      .from('galleries')
      .update({ delivery_settings: nextSettings })
      .eq('id', editingGallery.id)
    if (error) {
      // Roll back to the pre-change value so the UI stops lying to the user.
      // Leave unpublishedChanges as it was — the user intended an edit that
      // failed; the toast tells them; the button state reflects that there
      // is still drift the user may want to retry.
      setEditingGallery(g => g && g.id === editingGallery.id
        ? { ...g, delivery_settings: prevSettings } : g)
      showToast({ kind: 'error', text: 'שמירת ההגדרה נכשלה. נסה שוב.' })
      console.warn('[updateGallerySetting]', key, error)
    }
  }

  // Renaming the gallery touches two places: the canonical `galleries.name`
  // column (what the dashboard list + editor header read), and the legacy
  // `delivery_settings.galleryTitle` JSONB key (what the public viewer reads).
  // Until the schema is unified (Phase 6) we write both in one round-trip so
  // the rename stays consistent across surfaces.
  async function renameGalleryTitle(newTitle: string) {
    if (!editingGallery) return
    const prevSettings = editingGallery.delivery_settings || {}
    const prevName = editingGallery.name
    const nextSettings = { ...prevSettings, galleryTitle: newTitle }
    // Optimistic — same shape as updateGallerySetting. Activate the Update
    // button on the first keystroke instead of after the DB ack.
    setEditingGallery({ ...editingGallery, name: newTitle, delivery_settings: nextSettings })
    setGalleries(gs => gs.map(g => g.id === editingGallery.id ? { ...g, name: newTitle } : g))
    setUnpublishedChanges(true)
    const { error } = await supabase
      .from('galleries')
      .update({ name: newTitle, delivery_settings: nextSettings })
      .eq('id', editingGallery.id)
    if (error) {
      setEditingGallery(g => g && g.id === editingGallery.id
        ? { ...g, name: prevName, delivery_settings: prevSettings } : g)
      setGalleries(gs => gs.map(g => g.id === editingGallery.id ? { ...g, name: prevName } : g))
      showToast({ kind: 'error', text: 'שמירת הכותרת נכשלה. נסה שוב.' })
      console.warn('[renameGalleryTitle]', error)
    }
  }

  // Delete the entire gallery — sections + images cascade via FK (migration
  // 042). Storage objects are left for orphan reconciliation. Confirms with a
  // native dialog for now; Phase 3 replaces all native confirms with a styled
  // modal.
  async function deleteGallery(g: Gallery) {
    const photoCountTxt = (g.image_count ?? 0).toLocaleString('he-IL')
    if (!(await confirm({
      title: `למחוק את הגלריה "${g.name}"?`,
      body: (g.image_count ?? 0) > 0
        ? `${photoCountTxt} תמונות יימחקו לצמיתות. לא ניתן לבטל.`
        : 'לא ניתן לבטל.',
      confirmLabel: 'מחק את הגלריה',
      danger: true,
    }))) return
    // Snapshot the gallery's image paths BEFORE the row DELETE — once the
    // gallery row goes, the cascading FK delete takes the images with it
    // and we lose the paths the storage purge needs.
    void purgeStorageForGallery(g.id).then(() => {
      // Storage purge runs in the background. We don't await it because
      // 5000-photo galleries take minutes to wipe; the UI shouldn't block.
    })
    const { error } = await supabase.from('galleries').delete().eq('id', g.id)
    if (error) {
      showToast({ kind: 'error', text: 'מחיקת הגלריה נכשלה. נסה שוב.' })
      console.warn('[deleteGallery]', error)
      return
    }
    setGalleries(prev => prev.filter(x => x.id !== g.id))
    if (editingGallery?.id === g.id) setEditingGallery(null)
    showToast({ kind: 'success', text: `הגלריה "${g.name}" נמחקה.` })
  }

  // ── Gallery export → portable ZIP ──────────────────────────────────────────
  // Confirm with the photographer (count + heads-up that the file will be
  // large), then stream progress through exportGalleryAsZip. The button is
  // disabled while in-flight. Errors surface as plain alert()s — same idiom
  // the rest of this file uses, no toast library to introduce.
  async function handleGalleryExport() {
    if (!editingGallery || exporting) return
    const count = galleryImages.length || editingGallery.image_count || 0
    if (count === 0) {
      alert('אין תמונות בגלריה לייצוא')
      return
    }
    const ok = await confirm({
      title: 'ייצוא הגלריה',
      body: `ייצא את כל ה-${count} תמונות? זה ייקח כמה דקות וייצור קובץ ZIP גדול.`,
      confirmLabel: 'ייצא',
    })
    if (!ok) return
    setExporting(true)
    setExportProgress({ phase: 'metadata', current: 0, total: 1 })
    try {
      const result = await exportGalleryAsZip(editingGallery.id, {
        onProgress: setExportProgress,
      })
      const tail = result.failedCount
        ? `\n(${result.failedCount} תמונות נכשלו ולא נכללו בקובץ)`
        : ''
      alert(`הייצוא הושלם: ${result.filename}${tail}`)
    } catch (err) {
      if (err instanceof ExportCapExceededError) {
        alert(
          `הגלריה גדולה מדי לייצוא בדפדפן (יותר מ-${Math.round(err.cap / 1024 / 1024 / 1024)}GB). ` +
            `נדרשת גרסת שרת — נשלח עדכון בקרוב.`,
        )
      } else {
        console.error('[exportGallery] failed:', err)
        alert(`שגיאה בייצוא הגלריה: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
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
    // Client-side format check — avoids a network round-trip for the obvious
    // bad inputs (https://, trailing slash, leading dot, spaces, single-label
    // hosts like "localhost"). Server-side validation in the RPC remains the
    // source of truth; this just gives instant feedback for the easy cases.
    const VALID_DOMAIN = /^(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/
    if (!VALID_DOMAIN.test(candidate)) {
      setDomainError('דומיין לא תקין — דוגמה: photos.studio.co.il')
      return
    }
    setDomainSaving(true)
    setDomainError(null)
    try {
      const { data, error } = await supabase.rpc('set_business_custom_domain', { p_domain: candidate })
      if (error) {
        setDomainError(`שגיאה בשמירה — ${error.message}`)
        console.warn('[set_business_custom_domain]', error)
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
    const wasLive = editingGallery.status === 'live'
    const publishedAt = new Date().toISOString()
    // Flip publishing on so the button's label + spinner reflect the in-flight
    // request immediately — important because the supabase call can take
    // 200-600ms and previously the button looked dead during that window.
    setPublishing(true)
    const { error } = await supabase
      .from('galleries')
      .update({ status: 'live', published_at: publishedAt })
      .eq('id', editingGallery.id)
    setPublishing(false)
    if (error) {
      showToast({ kind: 'error', text: 'הפרסום נכשל. נסה שוב.' })
      console.warn('[publishGallery]', error)
      return
    }
    setEditingGallery({ ...editingGallery, status: 'live', published_at: publishedAt })
    // Clear the "unpublished changes" pill — the local preview now reflects
    // what visitors get on the published gallery, so the hint label below it
    // flips from "תצוגה מקומית · לא מעודכן" to "סונכרן עם הפרסום".
    setUnpublishedChanges(false)
    // Inline button feedback — briefly turns the button into a "✓ עודכן"
    // confirmation, then back to the resting state. Survives alongside the
    // toast so both screen-reading users and eyes-on-button users get a hit.
    setJustPublished(true)
    setTimeout(() => setJustPublished(false), 1800)
    showToast({ kind: 'success', text: wasLive ? 'הגלריה עודכנה ושודרה ללקוח' : 'הגלריה פורסמה ✓' })

    // Pre-warm the CDN edge so the first guest gets cached (~50ms) thumbnails
    // instead of the slow (~1.5s) cold-origin path. Fire-and-forget.
    void warmGalleryCache(editingGallery.id)

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

  // Dashboard-wide useToast() instance is declared near line 188; the
  // duplicate-gallery flow shares it. Just need the per-card "duplicating"
  // marker locally so the spinner stays scoped.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  // Clone an existing gallery's SETTINGS + SECTIONS into a fresh draft.
  // Prompts for the new name (defaults to "<source name> (עותק)"), calls the
  // duplicate_gallery RPC, refreshes the list, and opens the editor on the
  // new draft so the photographer can immediately tweak + upload. Photos are
  // NOT copied — each event has its own shoot.
  async function duplicateGallery(source: Gallery) {
    const proposed = window.prompt(
      'שם הגלריה החדשה',
      `${source.name} (עותק)`,
    )
    if (proposed === null) return
    const trimmed = proposed.trim()
    if (!trimmed) {
      showToast({ kind: 'error', text: 'יש להזין שם לגלריה החדשה' })
      return
    }
    setDuplicatingId(source.id)
    const { data, error } = await supabase.rpc('duplicate_gallery', {
      p_source_gallery_id: source.id,
      p_new_name: trimmed,
    })
    setDuplicatingId(null)
    if (error) {
      console.error('[duplicate-gallery] rpc failed', error)
      showToast({ kind: 'error', text: 'שכפול הגלריה נכשל. נסו שוב.' })
      return
    }
    const newId = typeof data === 'string' ? data : null
    showToast({ kind: 'success', text: `הגלריה "${trimmed}" נוצרה` })
    await fetchGalleries()
    if (newId) {
      // Open the editor for the new draft. We re-fetch from the DB so we
      // get the slug + delivery_settings that the RPC + slug trigger
      // produced, rather than reconstructing them client-side.
      const { data: fresh } = await supabase
        .from('galleries')
        .select('id, name, slug, image_count, published_at, status, download_count, favorite_count, delivery_settings')
        .eq('id', newId)
        .maybeSingle()
      if (fresh) openGalleryEditor(fresh as Gallery)
    }
  }

  const [copiedGalleryId, setCopiedGalleryId] = useState<string | null>(null)
  const [shareGallery, setShareGallery] = useState<Gallery | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareSubject, setShareSubject] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [shareSending, setShareSending] = useState(false)
  const [shareSent, setShareSent] = useState(false)
  // Preview-before-send: holds the rendered HTML returned from the edge
  // function so the photographer can see the email exactly as the client
  // will receive it. `previewLoading` is its in-flight flag; `previewHtml`
  // null means the preview modal is closed.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

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
  const storyStyleRef    = useFocusTrap<HTMLDivElement>(showStoryStyleModal, () => { if (!storyGenerating) setShowStoryStyleModal(false) })

  // ─── Stories Phase 2: trigger Lambda render + poll for completion ──────
  // POSTs to /api/stories/render which now actually invokes Remotion Lambda
  // and returns a renderId. We then poll /api/stories/status every 5s and
  // refresh the stories list when status flips to 'ready'.
  //
  // Cleanup: any active poll is cancelled when the gallery editor closes
  // (see the useEffect below). The pollers themselves are no-ops once they
  // see 'ready' or 'failed' so they self-terminate normally.

  function stopStoryPoll() {
    if (storyPollTimerRef.current) {
      clearInterval(storyPollTimerRef.current)
      storyPollTimerRef.current = null
    }
    storyPollRenderIdRef.current = null
  }

  // Re-fetch the stories list from the DB. Called when the poll lands on
  // 'ready' — the status endpoint has already inserted the public row, so a
  // simple SELECT brings the new mp4 into view alongside the existing ones.
  async function refreshStoriesForCurrentGallery() {
    if (!editingGallery) return
    const { data } = await supabase
      .from('stories')
      .select('id, style, storage_path, duration, created_at')
      .eq('gallery_id', editingGallery.id)
      .order('created_at', { ascending: true })
    setStories(data ?? [])
  }

  function startStoryPoll(renderId: string) {
    // Replace any prior timer — we only ever follow one render at a time per
    // editor session. The new one supersedes the old.
    stopStoryPoll()
    storyPollRenderIdRef.current = renderId
    storyPollTimerRef.current = setInterval(() => {
      const activeId = storyPollRenderIdRef.current
      if (!activeId) {
        stopStoryPoll()
        return
      }
      void pollStoryRender(activeId).then(snapshot => {
        // Guard against late ticks after the user navigated away.
        if (storyPollRenderIdRef.current !== activeId) return
        if (snapshot.status === 'ready') {
          stopStoryPoll()
          void refreshStoriesForCurrentGallery()
          showToast({ kind: 'success', text: 'הסטורי מוכן' })
        } else if (snapshot.status === 'failed') {
          stopStoryPoll()
          showToast({
            kind: 'error',
            text: `יצירת הסטורי נכשלה: ${snapshot.error_message ?? snapshot.error ?? 'שגיאה לא ידועה'}`,
          })
        }
        // 'queued' / 'rendering' → keep polling. No-op here.
      })
    }, 5000)
  }

  async function handleGenerateStoryConfirm() {
    if (!editingGallery || storyGenerating) return
    // Pull the curated list — order matters. If the photographer hasn't
    // touched the curator we still send the defaults explicitly (rather
    // than letting the server re-derive) so the rendered clip exactly
    // matches the preview the dashboard showed them.
    const photoIds = storyCandidateIds && storyCandidateIds.length >= STORY_GENERATE_MIN_PHOTOS
      ? storyCandidateIds
      : undefined
    setStoryGenerating(true)
    // Optimistic progress toast — the photographer can keep working while
    // the (future) Lambda render proceeds in the background.
    const estSec = estimateRenderSeconds(photoIds?.length ?? STORY_DEFAULT_PHOTO_BUDGET, storyGenStyle)
    showToast({ kind: 'info', text: `מייצר סטורי — ${formatStoryDuration(estSec)}` })
    const result = await requestStoryGeneration(editingGallery.id, storyGenStyle, photoIds)
    setStoryGenerating(false)
    setShowStoryStyleModal(false)
    if (result.ok) {
      showToast({
        kind: 'success',
        text: result.message === 'render_in_progress'
          ? 'הסטורי כבר בעיבוד — נמשיך לעקוב'
          : 'הסטורי נשלח לעיבוד',
      })
      // Kick off polling. We persist renderId in a ref so the cleanup
      // useEffect below can cancel it when the editor closes.
      if (result.renderId) {
        startStoryPoll(result.renderId)
      }
    } else {
      showToast({
        kind: 'error',
        text: `יצירת הסטורי נכשלה: ${result.error ?? 'שגיאה לא ידועה'}`,
      })
    }
  }

  async function sendShareEmail() {
    if (!shareGallery || !shareEmail) return
    setShareSending(true)
    // Warm the edge as the email (with the gallery link) goes out to the guest.
    void warmGalleryCache(shareGallery.id)
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
        showToast({ kind: 'error', text: 'שגיאה בשליחה: ' + (res.error || 'לא ידוע') })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ kind: 'error', text: 'שגיאה: ' + msg })
      console.warn('[sendGalleryShareEmail]', err)
    } finally {
      setShareSending(false)
    }
  }

  // Render the email (without sending) and open it in a sandboxed iframe so
  // the photographer can verify wording, brand colors, and CTA before any
  // client gets it. The edge function runs the same composer the send path
  // uses, so what they see is byte-identical to what's queued in Resend.
  async function previewShareEmail() {
    if (!shareGallery || previewLoading) return
    setPreviewLoading(true)
    try {
      const { previewGalleryShareEmail } = await import('../lib/shareGallery')
      const res = await previewGalleryShareEmail({
        galleryId: shareGallery.id,
        recipientEmail: shareEmail || undefined,
        subject: shareSubject || undefined,
        message: shareMessage || undefined,
      })
      if (res.ok && res.html) {
        setPreviewHtml(res.html)
      } else {
        alert('שגיאה בתצוגה מקדימה: ' + (res.error || 'לא ידוע'))
      }
    } catch (err) {
      alert('שגיאה: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPreviewLoading(false)
    }
  }

  // Clean, short, shareable URL — pixflow-ai.com/<business>/<gallery-slug>
  // (e.g. /eclipse-media/rapyd-saint-lucia), matching Pixieset. The router
  // resolves this by slug; falls back to the legacy /gallery/<id> form when a
  // slug is missing. Old UUID links keep working, so nothing breaks.
  function galleryShareUrl(g: { id: string; slug?: string | null }): string {
    const origin = window.location.origin
    return businessSlug && g.slug
      ? `${origin}/${businessSlug}/${g.slug}`
      : `${origin}/gallery/${g.id}`
  }

  function copyGalleryLink(galleryId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const g = galleries.find(x => x.id === galleryId)
    const url = g ? galleryShareUrl(g) : `${window.location.origin}/gallery/${galleryId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGalleryId(galleryId)
      setTimeout(() => setCopiedGalleryId(prev => prev === galleryId ? null : prev), 1800)
    })
    // Warm the edge at the exact moment the link is about to be sent, so an
    // older gallery (published before its cache was warm) is hot for the guest.
    void warmGalleryCache(galleryId)
  }

  const imgUrl = (path: string) => storageUrl('gallery-images', path)

  // ─── Bulk actions (selectMode) ───────────────────────────────────────────
  function exitSelectMode() {
    setSelectMode(false)
    setSelectedImageIds(new Set())
  }
  // Best-effort cleanup of the storage objects that backed a set of
  // images we just deleted from the DB. The DB row is the canonical
  // "deleted" signal — storage.remove() is non-transactional and runs
  // in the background so the UX never blocks on it. Failures log via
  // console.warn for a future reconciler to sweep up the orphans.
  //
  // Phase 4.2 dual-writes thumbnails to `gallery-images-thumbs-public`
  // too; this helper currently only purges the primary `gallery-images`
  // bucket. The thumbs bucket is a known follow-up (see commit message).
  async function purgeStorageForImages(images: GalleryImage[]) {
    const paths = new Set<string>()
    const thumbPaths = new Set<string>()
    for (const img of images) {
      if (img.storage_path) paths.add(img.storage_path)
      if (img.thumbnail_path) {
        paths.add(img.thumbnail_path)
        // Phase 4.2 dual-writes thumbnails to the public bucket for crawlers /
        // OG previews. Same key, different bucket — wipe both so the public
        // bucket doesn't accrue orphans too.
        thumbPaths.add(img.thumbnail_path)
      }
      if (img.original_path) paths.add(img.original_path)
    }
    if (paths.size === 0 && thumbPaths.size === 0) return
    // supabase-js storage.remove() accepts up to ~1000 paths per call;
    // 500 is a safe chunk size that leaves headroom for URL-length
    // limits and partial-failure reporting.
    const CHUNK = 500
    async function purgeBucket(bucket: string, all: string[]) {
      for (let i = 0; i < all.length; i += CHUNK) {
        const chunk = all.slice(i, i + CHUNK)
        try {
          const { error } = await supabase.storage.from(bucket).remove(chunk)
          if (error) {
            console.warn('[purgeStorageForImages] chunk remove failed', {
              bucket, chunkSize: chunk.length, error: error.message,
            })
          }
        } catch (e) {
          console.warn('[purgeStorageForImages] chunk remove threw', {
            bucket, chunkSize: chunk.length,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }
    await Promise.all([
      purgeBucket('gallery-images', Array.from(paths)),
      purgeBucket('gallery-images-thumbs-public', Array.from(thumbPaths)),
    ])
  }

  // Helper for whole-gallery deletes that don't carry the per-image local
  // state — selects all the gallery's image paths via the service-readable
  // images.select(), then hands the list to purgeStorageForImages. Best-
  // effort; never throws, never blocks the gallery delete itself.
  async function purgeStorageForGallery(galleryId: string) {
    const { data, error } = await supabase
      .from('images')
      .select('id, filename, storage_path:web_preview_path, thumbnail_path, original_path, is_top_pick, sort_order, section_id')
      .eq('gallery_id', galleryId)
    if (error || !data) {
      console.warn('[purgeStorageForGallery] could not list images', error)
      return
    }
    await purgeStorageForImages(data as GalleryImage[])
  }

  async function bulkDeleteSelected() {
    if (!editingGallery || selectedImageIds.size === 0) return
    const count = selectedImageIds.size
    if (!(await confirm({
      title: `למחוק ${count} תמונות?`,
      body: 'פעולה זו לא ניתנת לביטול.',
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    const ids = Array.from(selectedImageIds)
    // Snapshot paths from local state BEFORE the DB delete so we still
    // have them to feed the storage purge.
    const snap = galleryImages.filter(i => selectedImageIds.has(i.id))
    const { error } = await supabase.from('images').delete().in('id', ids)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + error.message })
      console.warn('[bulkDelete]', error)
      return
    }
    // Fire-and-forget — the row delete is canonical; storage cleanup
    // is best-effort and should never block the UI.
    void purgeStorageForImages(snap)
    setGalleryImages(prev => prev.filter(i => !selectedImageIds.has(i.id)))
    markDirty()
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
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[bulkToggleTopPick]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => selectedImageIds.has(i.id) ? { ...i, is_top_pick: makeTopPick } : i))
    markDirty()
    exitSelectMode()
  }
  // Select-all should match what the photographer is LOOKING at — sections
  // act as separate galleries (no "all photos" anymore), so selecting across
  // sections would silently bulk-delete invisible photos.
  function selectAllImages() {
    const visible = activeSectionId
      ? galleryImages.filter(i => i.section_id === activeSectionId)
      : galleryImages
    setSelectedImageIds(new Set(visible.map(i => i.id)))
  }

  // Single-image actions — invoked from the per-tile hover overlay so the
  // photographer can star, move, or delete one photo without entering
  // select mode. Each updates the local galleryImages state optimistically.
  async function toggleSingleTopPick(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img) return
    const next = !img.is_top_pick
    const { error } = await supabase.from('images').update({ is_top_pick: next }).eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[toggleSingleTopPick]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, is_top_pick: next } : i))
    markDirty()
  }
  async function moveImageToSection(imageId: string, sectionId: string | null) {
    const { error } = await supabase.from('images').update({ section_id: sectionId }).eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[moveImageToSection]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, section_id: sectionId } : i))
    markDirty()
  }
  async function deleteSingleImage(imageId: string) {
    if (!editingGallery) return
    if (!(await confirm({
      title: 'למחוק את התמונה?',
      body: 'פעולה זו לא ניתנת לביטול.',
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    const { error } = await supabase.from('images').delete().eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + error.message })
      console.warn('[deleteSingleImage]', error)
      return
    }
    setGalleryImages(prev => prev.filter(i => i.id !== imageId))
    markDirty()
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
    if (!editingGallery) return
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
    // Optimistic state update — paint the new order immediately, then
    // reconcile with the server. If the RPC fails the user sees a brief
    // flicker when we revert on partial-failure (see below).
    setGalleryImages(prev => prev.map(i =>
      idToOrder.has(i.id) ? { ...i, sort_order: idToOrder.get(i.id)! } : i
    ))
    markDirty()
    // Persist all moves. Use allSettled instead of all so a single failed
    // UPDATE doesn't leave the rest silently mis-ordered; if any failed we
    // tell the user + log the offending ids so the next reorder can heal.
    // (Phase 6 will replace this with one batched RPC; this is the safer
    // intermediate step.)
    const results = await Promise.allSettled(next.map((img, idx) =>
      supabase.from('images').update({ sort_order: idx * 1000 }).eq('id', img.id)
    ))
    const failedIds = results
      .map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)) ? next[i].id : null)
      .filter((x): x is string => x !== null)
    if (failedIds.length > 0) {
      showToast({ kind: 'error', text: `סידור ${failedIds.length} תמונות לא נשמר. גלריה תרענן.` })
      console.warn('[reorderImage] failed ids', failedIds)
    }
  }
  // Section drag-reorder — moves a dragged section before/at the position of
  // the drop target, renumbers all sections with a 1000-step gap, and
  // persists in parallel (Promise.allSettled so a single failed UPDATE
  // surfaces instead of silently leaving the DB out of order).
  async function reorderSection(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const ordered = sections.slice().sort((a, b) => a.sort_order - b.sort_order)
    const fromIdx = ordered.findIndex(s => s.id === draggedId)
    const toIdx = ordered.findIndex(s => s.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = ordered.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const idToOrder = new Map<string, number>()
    next.forEach((sec, idx) => idToOrder.set(sec.id, idx * 1000))
    setSections(prev => prev
      .map(s => idToOrder.has(s.id) ? { ...s, sort_order: idToOrder.get(s.id)! } : s)
      .sort((a, b) => a.sort_order - b.sort_order))
    markDirty()
    const results = await Promise.allSettled(next.map((sec, idx) =>
      supabase.from('gallery_sections').update({ sort_order: idx * 1000 }).eq('id', sec.id)
    ))
    const failedIds = results
      .map((r, i) => (r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)) ? next[i].id : null)
      .filter((x): x is string => x !== null)
    if (failedIds.length > 0) {
      showToast({ kind: 'error', text: `סידור ${failedIds.length} סקשנים לא נשמר. רענן את הגלריה.` })
      console.warn('[reorderSection] failed ids', failedIds)
    }
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

  /* ---------- Sign-in screen ----------
     Editorial-minimal. No gradients, no squircle icons, no drop-shadowed pill
     buttons. Cream canvas + tracked uppercase wordmark + hairline rule + an
     outlined dark CTA that inverts on hover — the same vocabulary as the rest
     of the dashboard. */
  if (!user) {
    return (
      <div style={{
        background: bg, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit', direction: 'rtl', padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.32em',
            textTransform: 'uppercase', color: textMuted, marginBottom: 28,
          }}>
            Pixflow
          </div>
          <div style={{ width: 28, height: 1, background: border, margin: '0 auto 28px' }} />
          <h1 style={{
            fontFamily: 'inherit', fontSize: 28, fontWeight: 400,
            color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.2,
            margin: '0 0 14px',
          }}>
            כניסה לחשבון
          </h1>
          <p style={{
            fontSize: 13, color: textSecondary, lineHeight: 1.6,
            margin: '0 0 40px',
          }}>
            ניהול הגלריות, פרסום ושיתוף עם הלקוחות.
          </p>
          <button
            onClick={signInWithGoogle}
            onMouseEnter={(e) => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'transparent', color: textPrimary,
              border: `1px solid ${textPrimary}`, borderRadius: 2,
              padding: '14px 30px', fontSize: 11, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              transition: 'background .15s, color .15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
            </svg>
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
  // Single canonical "publicly visible" state since migration 063. The
  // previous `=== 'live' || === 'published'` dual-check was a desktop-era
  // leftover; the backfill normalised 'published' rows to 'live' and the
  // gallery_status enum has no 'published' value.
  const publishedCount = galleries.filter((g) => g.status === 'live').length
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
      {/* In-app toasts (replaces silent alert() / vanished error states). */}
      <ToastContainer />

      {/* Lightbox — full-screen photo preview. Mounted only when open, so the
          dashboard pays nothing for it most of the time. */}
      {viewerImages && (
        <Viewer
          images={viewerImages}
          index={viewerIndex}
          imgBucket="gallery-images"
          allowDownloads
          downloadLabel="הורד"
          onClose={() => setViewerImages(null)}
          onNavigate={(i) => setViewerIndex(i)}
          onDownload={(img) => { void downloadOriginal(img.id) }}
        />
      )}

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
            { icon: 'gallery' as IconName, label: 'הגלריות שלי', active: true, disabled: false, href: undefined as string | undefined },
            { icon: 'palette' as IconName, label: 'Brand Kit',  active: false, disabled: false, href: '/brand-kit' as string | undefined },
            { icon: 'clients' as IconName,  label: 'לקוחות',      active: false, disabled: true, href: undefined as string | undefined },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => {
                if (item.disabled || !item.href) return
                window.location.pathname = item.href
              }}
              style={{
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
          <div className="dash-gallery-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 32,
          }}>
            {galleries.map((g, idx) => {
              const isHovered = hoveredCard === g.id
              const isLive = g.status === 'live'
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
                    {/* Destructive: delete the gallery. Visible on hover for
                        every gallery (live + draft) so abandoned tests can be
                        cleaned up. Native confirm() for now; Phase 3 swaps for
                        a styled modal. */}
                    {isHovered && (
                      <div style={{
                        position: 'absolute', top: 12, insetInlineEnd: 12,
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteGallery(g) }}
                          title="מחק גלריה"
                          aria-label="מחק גלריה"
                          style={{
                            width: 34, height: 34, borderRadius: 2,
                            background: 'rgba(255,255,255,.96)',
                            border: `1px solid rgba(20,20,19,.08)`,
                            color: '#c0392b', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                          }}
                        >
                          <Icon name="trash" size={14} strokeWidth={1.85} />
                        </button>
                      </div>
                    )}
                    {/* Hover action row — only on live galleries */}
                    {isLive && isHovered && (
                      <div style={{
                        position: 'absolute', bottom: 12, insetInlineStart: 12,
                        display: 'flex', gap: 6,
                      }}>
                        {isLive && (
                          <>
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
                          </>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateGallery(g) }}
                          disabled={duplicatingId === g.id}
                          title="שכפל גלריה"
                          aria-label="שכפל גלריה"
                          style={{
                            width: 34, height: 34, borderRadius: 2,
                            background: 'rgba(255,255,255,.96)',
                            border: `1px solid rgba(20,20,19,.08)`,
                            color: textPrimary,
                            cursor: duplicatingId === g.id ? 'wait' : 'pointer',
                            opacity: duplicatingId === g.id ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                          }}
                        >
                          <Icon name="duplicate" size={14} strokeWidth={1.85} />
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
          const isLiveStatus = editingGallery.status === 'live'
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
              className="dash-editor-modal"
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
              <div
                className="dash-editor-header"
                style={{
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
                  {/* Live-preview toggle — only meaningful on Settings + Welcome
                      tabs (where the side preview pane appears). Lets the
                      photographer reclaim the full editor width when they want
                      to focus, then bring the preview back in. */}
                  {(editTab === 'settings' || editTab === 'welcome') && (
                    <button
                      onClick={() => setShowSidePreview(v => !v)}
                      title={showSidePreview ? 'הסתר תצוגה חיה' : 'הצג תצוגה חיה'}
                      style={{
                        padding: '10px 14px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                        background: showSidePreview ? textPrimary : 'transparent',
                        border: `1px solid ${showSidePreview ? textPrimary : border}`,
                        color: showSidePreview ? '#fff' : textPrimary,
                        cursor: 'pointer', fontFamily: 'inherit',
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Icon name="arrow-out" size={12} strokeWidth={1.85} />
                      Live
                    </button>
                  )}
                  <a href={galleryShareUrl(editingGallery)} target="_blank" style={{
                    padding: '10px 18px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                    background: 'transparent', border: `1px solid ${border}`, color: textPrimary,
                    textDecoration: 'none', fontFamily: 'inherit',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                    <Icon name="arrow-out" size={13} strokeWidth={1.85} />
                    Preview
                  </a>
                  {/* Copy share link — useful right after the first publish too.
                      Inline label/icon flip on success so the eye on the button
                      gets immediate confirmation (toast remains for redundancy). */}
                  {isLiveStatus && (
                    <button
                      onClick={() => {
                        const url = galleryShareUrl(editingGallery)
                        navigator.clipboard.writeText(url).then(
                          () => {
                            setCopiedInEditor(true)
                            setTimeout(() => setCopiedInEditor(false), 1800)
                            showToast({ kind: 'success', text: 'הקישור הועתק ✓' })
                          },
                          () => showToast({ kind: 'error', text: 'לא הצלחנו להעתיק. העתק ידנית מהדפדפן.' }),
                        )
                        void warmGalleryCache(editingGallery.id)
                      }}
                      aria-live="polite"
                      style={{
                        padding: '10px 18px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                        background: copiedInEditor ? 'rgba(45,196,121,.10)' : 'transparent',
                        border: `1px solid ${copiedInEditor ? 'rgba(45,196,121,.45)' : border}`,
                        color: copiedInEditor ? '#1b8a4e' : textPrimary,
                        cursor: 'pointer', fontFamily: 'inherit',
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        transition: 'background .15s, border-color .15s, color .15s',
                      }}
                    >
                      <Icon name={copiedInEditor ? 'check' : 'copy'} size={13} strokeWidth={1.85} />
                      {copiedInEditor ? 'הקישור הועתק' : 'Copy Link'}
                    </button>
                  )}
                  {/* Publish (drafts) or Update (live). Visual states designed
                      to be undeniable at a glance:
                      - clean live   → outlined + heavily muted (opacity .4),
                                       dashed border, "מעודכן" — unmistakably idle
                      - dirty/draft  → strong filled-black + amber dot + "Update*"
                                       so even at a distance the user sees "act"
                      - publishing   → "מפרסם…" + disabled (no double-fire)
                      - just shipped → "✓ עודכן" sage tint for 1.8s */}
                  {(() => {
                    const isDraft = !isLiveStatus
                    const hasWork = isDraft || unpublishedChanges
                    const disabled = !hasWork || publishing
                    const baseLabel = publishing
                      ? 'מפרסם…'
                      : justPublished
                        ? (isDraft ? '✓ פורסם' : '✓ עודכן')
                        : (isDraft ? 'Publish' : (hasWork ? 'Update' : 'מעודכן'))
                    const filled = hasWork && !justPublished && !publishing
                    const successTint = justPublished
                    return (
                      <>
                        {/* External "dirty" indicator — extra signal beyond the
                            button color so the photographer can't miss the fact
                            that there are unsaved changes ready to publish. */}
                        {hasWork && !justPublished && !publishing && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 11, fontWeight: 500, color: '#b45309',
                            letterSpacing: '0.06em',
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: '#d97706',
                              boxShadow: '0 0 0 3px rgba(217,119,6,.18)',
                            }} />
                            {isDraft ? 'טיוטה' : 'שינויים שטרם פורסמו'}
                          </span>
                        )}
                        <button
                          onClick={publishGallery}
                          disabled={disabled}
                          aria-live="polite"
                          style={{
                            padding: '10px 22px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                            background: successTint
                              ? 'rgba(45,196,121,.12)'
                              : filled ? textPrimary : 'transparent',
                            border: successTint
                              ? `1px solid rgba(45,196,121,.5)`
                              : filled
                                ? `1px solid ${textPrimary}`
                                : `1px dashed ${border}`,
                            color: successTint
                              ? '#1b8a4e'
                              : filled ? '#fff' : textMuted,
                            cursor: disabled ? 'default' : 'pointer',
                            opacity: disabled && !successTint && !publishing ? 0.45 : 1,
                            fontFamily: 'inherit',
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            transition: 'background .15s, border-color .15s, color .15s, opacity .15s, box-shadow .15s',
                            minWidth: 110,
                            boxShadow: filled && !publishing ? '0 1px 0 rgba(20,20,19,.18), 0 4px 14px rgba(20,20,19,.12)' : 'none',
                          }}
                        >{baseLabel}</button>
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Editor body — split layout. Sidebar holds cover preview +
                  vertical icon tabs (mirrors Pixieset). Main area holds the
                  active tab's content. RTL flow keeps the sidebar visually
                  on the right side of the modal — natural for Hebrew users.
                  Below 900px (`.dash-editor-body` in styles.css) this stack
                  flips to column so the sidebar becomes a slim top strip. */}
              <div className="dash-editor-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {/* ── Sidebar ─────────────────────────────────── */}
                <aside className="dash-editor-sidebar" style={{
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
                      { id: 'photos' as const,     icon: 'photo'     as IconName, label: 'תמונות' },
                      // Sections tab removed — sections are managed inline in
                      // the Photos tab's sidebar (add / rename / delete / drag-
                      // reorder), so a dedicated tab was redundant.
                      { id: 'stories' as const,    icon: 'stories'   as IconName, label: 'סטוריז' },
                      { id: 'welcome' as const,    icon: 'palette'   as IconName, label: 'עיצוב' },
                      { id: 'preview' as const,    icon: 'arrow-out' as IconName, label: 'תצוגה חיה' },
                      { id: 'activities' as const, icon: 'activity'  as IconName, label: 'פעילות' },
                      { id: 'settings' as const,   icon: 'settings'  as IconName, label: 'הגדרות' },
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

                    {/* Sets — drag handle, name (or rename input), count, "..." menu */}
                    {sections.map(s => {
                      const isActive = activeSectionId === s.id
                      const count = (galleryImages as GalleryImage[]).filter(im => im.section_id === s.id).length
                      const isRenaming = renamingSectionId === s.id
                      const isMenuOpen = sectionMenuOpenId === s.id
                      const isDragSource = draggedSectionId === s.id
                      const isDropTarget = sectionDragOverId === s.id && draggedSectionId && draggedSectionId !== s.id
                      return (
                        <div
                          key={s.id}
                          draggable={!isRenaming}
                          onDragStart={(e) => {
                            if (isRenaming) return
                            setDraggedSectionId(s.id)
                            e.dataTransfer.effectAllowed = 'move'
                            try { e.dataTransfer.setData('text/plain', s.id) } catch {}
                          }}
                          onDragOver={(e) => {
                            if (!draggedSectionId || draggedSectionId === s.id) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (sectionDragOverId !== s.id) setSectionDragOverId(s.id)
                          }}
                          onDragLeave={() => {
                            if (sectionDragOverId === s.id) setSectionDragOverId(null)
                          }}
                          onDrop={(e) => {
                            if (!draggedSectionId) return
                            e.preventDefault()
                            const src = draggedSectionId
                            setDraggedSectionId(null); setSectionDragOverId(null)
                            if (src && src !== s.id) void reorderSection(src, s.id)
                          }}
                          onDragEnd={() => { setDraggedSectionId(null); setSectionDragOverId(null) }}
                          style={{
                            position: 'relative',
                            background: isDropTarget ? bgSubtle : (isActive ? bgSubtle : 'transparent'),
                            opacity: isDragSource ? 0.4 : 1,
                            transition: 'background .15s, opacity .15s',
                            cursor: isRenaming ? 'text' : 'grab',
                            borderTop: isDropTarget ? `1px solid ${textPrimary}` : '1px solid transparent',
                          }}>
                          {/* Section row — select-section action (outer button)
                              and the three-dot menu (sibling button). Was
                              previously a button nested inside another button,
                              which is invalid HTML and confused screen readers
                              with two overlapping click targets. */}
                          <button onClick={() => { setActiveSectionId(s.id); setSectionMenuOpenId(null) }} style={{
                            width: '100%', textAlign: 'right' as const,
                            padding: '10px 36px 10px 12px', borderRadius: 2,
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
                                value={sectionRenameDraft}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setSectionRenameDraft(e.target.value)}
                                onBlur={() => {
                                  // Escape → cancelled flag set → don't save.
                                  if (sectionRenameCancelledRef.current) {
                                    sectionRenameCancelledRef.current = false
                                    setRenamingSectionId(null)
                                    return
                                  }
                                  const v = sectionRenameDraft.trim()
                                  if (v && v !== s.name) renameSection(s.id, v)
                                  setRenamingSectionId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') {
                                    sectionRenameCancelledRef.current = true
                                    ;(e.target as HTMLInputElement).blur()
                                  }
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
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSectionMenuOpenId(isMenuOpen ? null : s.id) }}
                            aria-label="עוד פעולות לסקשן"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            style={{
                              position: 'absolute', top: 8, insetInlineEnd: 6,
                              width: 24, height: 24, borderRadius: 2,
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: textMuted,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Icon name="menu" size={14} strokeWidth={1.85} />
                          </button>
                          {isMenuOpen && (
                            <div style={{
                              position: 'absolute', top: '100%', insetInlineStart: 8,
                              background: cardSolid, border: `1px solid ${border}`,
                              boxShadow: '0 8px 24px rgba(0,0,0,.08)', zIndex: 5,
                              minWidth: 140, padding: 4,
                            }}>
                              <button
                                onClick={() => {
                                  setSectionRenameDraft(s.name)
                                  sectionRenameCancelledRef.current = false
                                  setRenamingSectionId(s.id)
                                  setSectionMenuOpenId(null)
                                }}
                                style={{
                                  width: '100%', textAlign: 'right' as const,
                                  padding: '8px 10px', borderRadius: 2,
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  fontFamily: 'inherit', fontSize: 12, color: textPrimary,
                                }}
                              >שינוי שם</button>
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

                {/* ── Main content pane + optional side-preview ─────── */}
                {(() => {
                  const sidePreviewActive = showSidePreview &&
                    (editTab === 'settings' || editTab === 'welcome')
                  return (
                <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                <div style={{
                  flex: 1, overflowY: 'auto',
                  padding: '24px 32px', minWidth: 0,
                }}>

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
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      marginBottom: 24, gap: 16,
                    }}>
                      {(() => {
                        const activeSec = activeSectionId ? sections.find(s => s.id === activeSectionId) : null
                        const visibleImages = activeSectionId
                          ? (galleryImages as GalleryImage[]).filter(im => im.section_id === activeSectionId)
                          : galleryImages
                        const editingDesc = activeSec && editingSectionDescId === activeSec.id
                        return (
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <h3 style={{
                              fontSize: 22, fontWeight: 500, margin: 0,
                              letterSpacing: '-0.015em', color: textPrimary,
                            }}>
                              {activeSec ? activeSec.name : 'תמונות'}
                              <span style={{
                                marginInlineStart: 12, color: textMuted,
                                fontSize: 14, fontWeight: 400,
                              }}>
                                {visibleImages.length}
                              </span>
                            </h3>
                            {/* Inline-editable description for the active section
                                (shown to the client below the chapter heading). */}
                            {activeSec && (editingDesc ? (
                              <textarea
                                autoFocus
                                value={sectionDescDraft}
                                onChange={e => setSectionDescDraft(e.target.value)}
                                onBlur={() => {
                                  void saveSectionDescription(activeSec.id, sectionDescDraft)
                                  setEditingSectionDescId(null)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Escape') { setEditingSectionDescId(null); return }
                                  // Cmd/Ctrl+Enter commits (plain Enter inserts newline).
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur()
                                }}
                                placeholder="תיאור לסקשן (מוצג ללקוח מתחת לכותרת הפרק)"
                                rows={2}
                                maxLength={500}
                                style={{
                                  marginTop: 8, width: '100%', maxWidth: 560,
                                  padding: '8px 10px', borderRadius: 2,
                                  border: `1px solid ${border}`, background: '#fff',
                                  color: textPrimary, fontSize: 13, lineHeight: 1.45,
                                  fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const,
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSectionDescDraft(activeSec.description ?? '')
                                  setEditingSectionDescId(activeSec.id)
                                }}
                                style={{
                                  display: 'block', marginTop: 6,
                                  padding: 0, background: 'transparent', border: 'none',
                                  textAlign: 'right' as const, cursor: 'text',
                                  color: activeSec.description ? textSecondary : textMuted,
                                  fontSize: 13, lineHeight: 1.45, fontFamily: 'inherit',
                                  maxWidth: 560,
                                }}
                              >
                                {activeSec.description || '+ הוסף תיאור לסקשן'}
                              </button>
                            ))}
                          </div>
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
                      // Virtualize past 300 photos — see App.tsx for the
                      // same threshold + rationale. Below 300 we keep CSS
                      // grid for the auto-fill behaviour photographers
                      // already know; past it, react-window's FixedSizeGrid
                      // mounts only the visible square tiles (~3-5 rows).
                      const VIRTUALIZE_THRESHOLD = 300
                      const shouldVirtualizeDashboard =
                        visibleImages.length > VIRTUALIZE_THRESHOLD
                      // Tile renderer — shared between the non-virtualized
                      // grid and the FixedSizeGrid cell renderer so per-tile
                      // UX (drag, hover overlay, menu) is identical.
                      const renderTile = (img: GalleryImage) => {
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
                                e.stopPropagation()
                                if (selectMode) {
                                  // In select mode, click toggles selection.
                                  setSelectedImageIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(img.id)) next.delete(img.id); else next.add(img.id)
                                    if (next.size === 0) setSelectMode(false)
                                    return next
                                  })
                                  return
                                }
                                // Otherwise: open the lightbox scoped to the
                                // currently-visible grid (active section's
                                // images, sorted as rendered). The lightbox
                                // navigates within this snapshot.
                                const visible = activeSectionId
                                  ? galleryImages.filter(i => i.section_id === activeSectionId)
                                  : galleryImages
                                const sorted = visible.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                const idx = sorted.findIndex(i => i.id === img.id)
                                if (idx >= 0) {
                                  setViewerImages(sorted)
                                  setViewerIndex(idx)
                                }
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
                                      {/* Don't offer the current section as a destination — moving a
                                          photo to where it already lives is a wasted round-trip and
                                          made the menu visually noisy. */}
                                      {sections.filter(s => s.id !== img.section_id).map(s => (
                                        <button key={s.id}
                                          onClick={() => { moveImageToSection(img.id, s.id); setImageMenuOpenId(null) }}
                                          style={{
                                            width: '100%', textAlign: 'right' as const, padding: '8px 10px',
                                            background: 'transparent',
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
                        }
                      if (!visibleImages.length) return null
                      if (!shouldVirtualizeDashboard) {
                        return (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))`,
                            gap: 4,
                          }}>
                            {visibleImages.map(img => renderTile(img))}
                          </div>
                        )
                      }
                      // Virtualized path. FixedSizeGrid needs concrete
                      // pixel dimensions; we read the container width from
                      // window.innerWidth minus the sidebar+padding budget
                      // (~360px on the dashboard layout). This is a heuristic
                      // — for pixel-perfect sizing we'd plumb a ResizeObserver
                      // through, but the visible difference is one tile per
                      // row at most, and FixedSizeGrid handles overflow.
                      const VirtualPhotoGrid = () => {
                        // tile size = minCell; row height = same (square)
                        // viewport budget: open dashboard tab is roughly
                        // viewportHeight - 280px of chrome (tabs + filters).
                        const w = typeof window === 'undefined' ? 1200 : Math.max(360, window.innerWidth - 360)
                        const h = typeof window === 'undefined' ? 800 : Math.max(400, window.innerHeight - 280)
                        const colCount = Math.max(1, Math.floor((w + 4) / (minCell + 4)))
                        const rowCount = Math.ceil(visibleImages.length / colCount)
                        const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
                          const idx = rowIndex * colCount + columnIndex
                          const img = visibleImages[idx]
                          if (!img) return <div style={style} />
                          // react-window's `style` positions the cell; the
                          // inner tile is what renderTile returns. Wrap so
                          // the tile gets the absolute position from
                          // react-window without breaking its own
                          // position: relative for menu/checkbox overlays.
                          return (
                            <div style={{ ...style, padding: 2 }}>
                              {renderTile(img)}
                            </div>
                          )
                        }
                        return (
                          <FixedSizeGrid
                            columnCount={colCount}
                            rowCount={rowCount}
                            columnWidth={minCell + 4}
                            rowHeight={minCell + 4}
                            height={h}
                            width={w}
                            overscanRowCount={2}
                          >
                            {Cell}
                          </FixedSizeGrid>
                        )
                      }
                      return <VirtualPhotoGrid />
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

                {/* Sections panel removed — duplicated the Photos-tab sidebar
                    section list (add / rename / delete / drag-reorder), and
                    the dashboard had no second-class section editor anymore. */}

                {/* ── Stories Tab ── */}
                {editTab === 'stories' && (
                  <div style={{ padding: '0 4px' }}>
                    {/* Honest status banner — the auto-generate flow is wired
                        end-to-end (UI → API → DB rows in story_renders) but
                        the actual Remotion Lambda is not deployed yet. So
                        clicking "צור סטורי" inserts a queued render-job row
                        and returns success, but no mp4 actually lands. Be
                        upfront about that so the photographer doesn't sit
                        and wait for nothing. */}
                    <div style={{
                      marginBottom: 18, padding: '10px 14px',
                      border: `1px dashed ${border}`, background: bgSubtle,
                      fontSize: 12, color: textSecondary, lineHeight: 1.55,
                    }}>
                      <strong style={{ color: textPrimary }}>⚙ יצירה אוטומטית — בקרוב.</strong>
                      &nbsp;התשתית (Remotion + Lambda) פרוסה בקוד ובמסד, אבל הענן עוד לא מחובר.
                      לחיצה על "צור סטורי" תיצור בקשת רינדור בתור, אבל הסרטון עצמו לא יופיע עד שתפעיל את הענן (ראה <code>gallery-web/stories-remotion/README.md</code>).
                      <br />
                      בינתיים — <strong>העלאת סטורי MP4 ידנית עובדת מלא</strong> דרך הכפתור משמאל.
                    </div>
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
                      {/* CTA cluster — generate (auto, Phase 1) sits to the
                          left of the manual upload because automatic is the
                          headline feature; manual stays as the escape hatch
                          when the photographer wants a hand-edited clip. */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {/* Auto-generate CTA — only renders when the gallery
                            has enough photos for a coherent ~30s clip. The
                            gate is intentional: rendering a story from 4
                            images looks like a slideshow, not a story. */}
                        {galleryImages.length >= STORY_GENERATE_MIN_PHOTOS && (
                          <button
                            onClick={() => {
                              setStoryGenStyle('clean')
                              // Initialise the curator with the default
                              // shot list (favorites if any, else first N)
                              // so the modal opens with something concrete
                              // the photographer can immediately edit.
                              const favs = galleryImages
                                .filter(i => i.is_top_pick)
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map(i => i.id)
                              const defaults = favs.length > 0
                                ? favs.slice(0, STORY_GENERATE_MAX_PHOTOS)
                                : galleryImages
                                    .slice()
                                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                    .slice(0, STORY_DEFAULT_PHOTO_BUDGET)
                                    .map(i => i.id)
                              setStoryCandidateIds(defaults)
                              setStoryShowAddPicker(false)
                              setShowStoryStyleModal(true)
                            }}
                            disabled={storyGenerating || storyUploading}
                            style={{
                              padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
                              background: 'transparent', border: `1px solid ${textPrimary}`,
                              color: textPrimary,
                              cursor: storyGenerating ? 'wait' : 'pointer',
                              fontFamily: 'inherit',
                              opacity: storyGenerating ? 0.6 : 1,
                              letterSpacing: '0.18em', textTransform: 'uppercase',
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}
                          >
                            <Icon name="stories" size={13} strokeWidth={2} />
                            צור סטורי אוטומטית
                          </button>
                        )}
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
                      <div className="dash-stories-grid" style={{
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
                                // preload="none" — was "metadata" which fires a
                                // range request for every story tile on tab open
                                // (heavy on mobile + galleries with 20+ stories).
                                // Hover triggers play() which loads what's needed.
                                preload="none"
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
                  // `ds` is aliased from the parent-scope memoized projection
                  // so we don't allocate a new object on every render.
                  const ds = editorDs
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
                          // Write the column + JSONB key in ONE update so the
                          // two never drift (rekognition RPC reads the column;
                          // the public viewer reads the JSONB). Was two
                          // separate non-atomic UPDATEs that could leave the
                          // gallery in a half-on state on transient failure.
                          if (!editingGallery) return
                          const newVal = !ds.faceIndexEnabled
                          const prevSettings = editingGallery.delivery_settings || {}
                          const nextSettings = { ...prevSettings, faceIndexEnabled: newVal }
                          setEditingGallery({
                            ...editingGallery,
                            face_index_enabled: newVal,
                            delivery_settings: nextSettings,
                          })
                          markDirty()
                          const { error } = await supabase
                            .from('galleries')
                            .update({ face_index_enabled: newVal, delivery_settings: nextSettings })
                            .eq('id', editingGallery.id)
                          if (error) {
                            setEditingGallery(g => g && g.id === editingGallery.id
                              ? { ...g, face_index_enabled: !newVal, delivery_settings: prevSettings } : g)
                            showToast({ kind: 'error', text: 'שמירת זיהוי פנים נכשלה.' })
                            console.warn('[face-index toggle]', error)
                          }
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

                    {/* ── Backup (per-gallery, portable ZIP) ──────────────
                        Lets the photographer pull every original + a
                        metadata.json sidecar in one ZIP. Important for trust
                        + a migration safety net. Phase 1 is browser-side;
                        for 500+-image galleries Phase 2 should spawn a
                        server-side render to S3 + presigned URL. */}
                    <Section eyebrow="גיבוי וייצוא">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
                            ייצא את כל הגלריה כקובץ ZIP
                          </div>
                          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6 }}>
                            כל המקור (או תצוגות web אם המקור לא הועלה) + metadata.json עם
                            הגדרות הגלריה, סקציות וסדר התמונות. הקובץ נייד וניתן לשחזור בעתיד.
                          </div>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={handleGalleryExport}
                            disabled={exporting}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              padding: '10px 18px', borderRadius: 2,
                              background: exporting ? bgSubtle : textPrimary,
                              color: exporting ? textMuted : '#fff',
                              border: `1px solid ${exporting ? border : textPrimary}`,
                              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
                              opacity: exporting ? 0.7 : 1,
                            }}
                          >
                            <Icon name="download" size={14} />
                            <span>
                              {exporting
                                ? exportProgress
                                  ? exportProgressLabel(exportProgress)
                                  : 'מייצא...'
                                : 'ייצא גלריה (ZIP)'}
                            </span>
                          </button>
                        </div>
                      </div>
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
                          <div className="dash-dns-grid" style={{
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
                              רענן סטטוס
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
                  // Same memoized `ds` projection used by the Settings tab —
                  // see editorDs near the top of the component.
                  const ds = editorDs
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
                          <div className="dash-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
                              <span>תמונת שער · ראש הגלריה</span>
                              {(ds.coverImageUrl || ds.coverImagePath) && (
                                <button onClick={() => updateGallerySettings({ coverImageUrl: null, coverImagePath: null })} style={{
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  color: textMuted, fontFamily: 'inherit',
                                  fontSize: 9, fontWeight: 500, letterSpacing: '0.18em',
                                  textTransform: 'uppercase', padding: 0,
                                }}>נקה</button>
                              )}
                            </div>

                            {/* Live preview of what the gallery header (hero)
                                will show — makes the cover choice obvious and
                                WYSIWYG instead of buried in a thumbnail grid. */}
                            <div style={{
                              position: 'relative', width: '100%', aspectRatio: '16 / 7',
                              borderRadius: 10, overflow: 'hidden', marginBottom: 14,
                              background: '#0a0a0f',
                            }}>
                              {((ds.coverImageUrl as string) || galleryImages[0]) && (
                                <img
                                  src={(ds.coverImageUrl as string) || imgUrl(galleryImages[0].thumbnail_path || galleryImages[0].storage_path)}
                                  alt=""
                                  style={{
                                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                                    filter: ds.coverImageUrl ? 'none' : 'blur(3px) brightness(0.55)',
                                  }}
                                />
                              )}
                              <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 5, padding: 12,
                                background: 'linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,.6))',
                                color: '#fff', textAlign: 'center',
                              }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.8 }}>
                                  תצוגה מקדימה · ראש הגלריה
                                </div>
                                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>
                                  {(ds.galleryTitle as string) || editingGallery.name}
                                </div>
                                {!ds.coverImageUrl && (
                                  <div style={{ fontSize: 10.5, opacity: 0.8 }}>
                                    לא נבחר שער — מוצגת התמונה הראשונה. בחר תמונה למטה ↓
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                              gap: 4,
                            }}>
                              {galleryImages.slice(0, 48).map(img => {
                                const url = imgUrl(img.storage_path)
                                // Prefer the canonical storage_path comparison
                                // — the URL form drifts when buckets switch from
                                // public to signed URLs or when VITE_SUPABASE_URL
                                // changes per env. Fall back to URL match so
                                // legacy galleries (no coverImagePath yet) still
                                // highlight the right tile.
                                const isCover =
                                  (ds.coverImagePath as string | undefined) === img.storage_path
                                  || ds.coverImageUrl === url
                                return (
                                  <button key={img.id}
                                    onClick={() => updateGallerySettings({
                                      // Path is the new canonical value; URL
                                      // is dual-written for backward compat
                                      // until the viewer migrates (Phase 6).
                                      coverImagePath: img.storage_path,
                                      coverImageUrl: url,
                                    })}
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
                            onChange={e => renameGalleryTitle(e.target.value)}
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
                        <label style={{ display: 'block' }}>
                          <span style={{ ...labelStyle }}>תיאור האלבום</span>
                          <textarea
                            value={(ds.galleryDescription as string) || ''}
                            onChange={e => updateGallerySetting('galleryDescription', e.target.value)}
                            placeholder="טקסט קצר שמופיע ללקוח על הגלריה — מקום, סיפור, הוקרה."
                            rows={3}
                            maxLength={500}
                            style={{ ...inputBase, resize: 'vertical' as const, minHeight: 72, fontFamily: 'inherit', lineHeight: 1.45 }}
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
                              {/* Preview line — uses the gallery's actual title /
                                  description so the photographer sees their own
                                  content rendered in the chosen font. Falls back
                                  to a representative placeholder if those fields
                                  aren't set yet. */}
                              <div style={{
                                marginTop: 12, padding: '20px 18px',
                                background: bgSubtle, border: `1px solid ${border}`,
                                fontFamily: `'${current}', sans-serif`,
                                fontSize: f.key === 'headingFont' ? 24 : 14,
                                fontWeight: f.key === 'headingFont' ? 500 : 400,
                                color: textPrimary,
                                letterSpacing: f.key === 'headingFont' ? '-0.015em' : '0',
                                lineHeight: f.key === 'headingFont' ? 1.15 : 1.5,
                                whiteSpace: 'pre-wrap' as const,
                              }}>
                                {f.key === 'headingFont'
                                  ? ((ds.galleryTitle as string)?.trim() || editingGallery.name || 'הגלריה של יוסי ומיכל')
                                  : ((ds.galleryDescription as string)?.trim() || 'תיאור קצר של האירוע מופיע כאן בגוף הטקסט.')}
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

                {/* ── Live Preview ── moved out of its own tab.
                    The full-page iframe-based preview was unused (`{false && ...}`)
                    and its companion side-preview (below) used to be an iframe too.
                    Both are now replaced by the in-process LocalGalleryPreview
                    component rendered alongside Settings + Welcome. */}
                </div>
                {/* Side-preview — RENDERED IN-PROCESS via LocalGalleryPreview.
                    Was previously an <iframe src={publicUrl}?v=N> that reloaded
                    on every keystroke (full HTML + JS + image refetch). Now
                    React re-renders the local component from `editingGallery`
                    / `sections` / `galleryImages` state — zero network on
                    settings changes. The DB write still happens (debounced
                    inside updateGallerySetting), but the preview no longer
                    waits for it. The "תצוגה מקומית" hint clarifies for the
                    photographer that what they see is unsaved local state. */}
                {sidePreviewActive && (
                  <aside style={{
                    width: 'min(48%, 540px)', flexShrink: 0,
                    borderInlineStart: `1px solid ${border}`,
                    background: bgSubtle, display: 'flex', flexDirection: 'column',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, padding: '12px 14px',
                      borderBottom: `1px solid ${border}`, background: '#fff',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: textMuted,
                      }}>תצוגה חיה ללקוח</span>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => setShowSidePreview(false)}
                          aria-label="הסתר תצוגה"
                          title="הסתר תצוגה"
                          style={{
                            padding: '4px 8px', borderRadius: 2,
                            background: 'transparent', border: `1px solid ${border}`,
                            color: textMuted, cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 10,
                          }}
                        >✕</button>
                      </div>
                    </div>
                    <div style={{
                      flex: 1, minHeight: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                      padding: 12, background: bgSubtle,
                    }}>
                      <LocalGalleryPreview
                        gallery={editingGallery}
                        sections={sections}
                        images={galleryImages}
                        mode={editTab === 'welcome' ? 'welcome' : 'feed'}
                      />
                    </div>
                    {/* Hint label — tells the photographer the preview reflects
                        their unsaved local edits, not what visitors currently
                        see on the published gallery. Flips to "synced" once
                        unpublishedChanges clears (after Publish / Update). */}
                    <div style={{
                      padding: '8px 14px',
                      borderTop: `1px solid ${border}`,
                      background: '#fff',
                      fontSize: 10, color: textMuted,
                      letterSpacing: '0.04em', textAlign: 'center' as const,
                    }}>
                      {unpublishedChanges
                        ? 'תצוגה מקומית · לא מעודכן מהפרסום האחרון'
                        : 'סונכרן עם הפרסום'}
                    </div>
                  </aside>
                )}
                </div>
                )
                })()}
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
                  className="dash-mobile-modal"
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

                  <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
              {/* Placeholder rows for the upcoming "download tracking" feature.
                  Visually mocked with skeleton bars instead of fake emails — so
                  the photographer can't mistake them for real activity. */}
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,.02)', border: `1px solid rgba(0,0,0,.03)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: 0.55,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: 10, width: '60%', borderRadius: 4,
                      background: border, marginBottom: 6,
                    }} />
                    <div style={{
                      height: 8, width: '30%', borderRadius: 4,
                      background: border,
                    }} />
                  </div>
                  <div style={{
                    height: 22, width: 36, borderRadius: 8,
                    background: 'rgba(45,196,121,.1)',
                  }} />
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
              <div className="dash-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
              <div className="dash-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
                  <div className="dash-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

            <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, marginTop: 32, justifyContent: 'flex-end' }}>
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
                className="dash-mobile-modal"
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
                <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={previewShareEmail}
                    disabled={shareSending || previewLoading}
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      color: textSecondary, fontSize: 13, fontWeight: 600,
                      cursor: previewLoading ? 'wait' : 'pointer',
                      textDecoration: 'underline', textUnderlineOffset: 4,
                      fontFamily: 'inherit', opacity: shareSending ? 0.5 : 1,
                    }}
                  >
                    {previewLoading ? 'טוען…' : 'תצוגה מקדימה'}
                  </button>
                </div>
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

      {/* ───────────── Share Email Preview ─────────────
          Renders the server-composed HTML in a sandboxed iframe so the
          photographer can verify the branded email before sending. The
          iframe sandbox allows same-origin styles to render (no scripts)
          so links don't accidentally navigate the dashboard tab. */}
      {previewHtml && (
        <div
          onClick={() => setPreviewHtml(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2200,
            background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'overlayIn .2s ease both',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="תצוגה מקדימה של המייל"
            onClick={e => e.stopPropagation()}
            style={{
              background: bg, width: '100%', maxWidth: 640,
              borderRadius: 22, padding: 20,
              border: `1px solid ${border}`,
              animation: 'modalIn .3s ease both',
              boxShadow: '0 30px 100px rgba(0,0,0,.6)',
              display: 'flex', flexDirection: 'column', gap: 12,
              maxHeight: '90vh',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>תצוגה מקדימה</h2>
              <button
                onClick={() => setPreviewHtml(null)}
                aria-label="סגירה"
                style={{
                  background: 'transparent', border: 'none', color: textMuted,
                  fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>
            <iframe
              title="email-preview"
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              style={{
                width: '100%', flex: 1, minHeight: 480,
                border: `1px solid ${border}`, borderRadius: 12, background: '#fff',
              }}
            />
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
                    else {
                      console.warn('[startCheckout] no url returned', { planId: pkg.planId })
                      showToast({ kind: 'error', text: 'שגיאה בפתיחת תשלום. נסה שוב.' })
                    }
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

      {/* ───────── Stories Phase 1 — style picker modal ─────────
          Confirms the style before POSTing /api/stories/render. Phase 2 will
          extend the radio group with vintage / fast-social once those
          Remotion compositions land. Backdrop click + Escape both dismiss
          (the latter via the useFocusTrap above). */}
      {showStoryStyleModal && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            if (!storyGenerating) setShowStoryStyleModal(false)
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'overlayIn .2s ease both',
          }}
        >
          <div
            ref={storyStyleRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-style-heading"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', width: 'calc(100vw - 40px)', maxWidth: 460,
              maxHeight: 'calc(100vh - 32px)',
              display: 'flex', flexDirection: 'column',
              border: `1px solid ${border}`,
              animation: 'modalIn .25s ease both',
            }}
          >
            {/* Scrollable body — the modal got tall enough on small viewports
                that the footer buttons fell off-screen and were unclickable.
                Splitting into body + sticky footer keeps the CTAs always
                reachable regardless of how many photos are in the curator. */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '24px 28px 12px',
            }}>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
              color: textMuted, textTransform: 'uppercase', marginBottom: 14,
            }}>
              Story generator
            </div>
            <h3 id="story-style-heading" style={{
              fontSize: 22, fontWeight: 500, margin: '0 0 14px',
              color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.15,
            }}>
              איזה סגנון סטורי?
            </h3>

            {/* Photo curator — full edit-before-generate: see the candidate
                shot list, drag-reorder, remove (✕), add more from the rest of
                the gallery. Default load is favorites if any, otherwise the
                first N; the photographer can override everything. */}
            {(() => {
              const candidates = storyCandidateIds ?? []
              const candidateSet = new Set(candidates)
              const imgById = new Map(galleryImages.map(i => [i.id, i]))
              const ordered = candidates
                .map(id => imgById.get(id))
                .filter((i): i is GalleryImage => !!i)
              const additionalPool = galleryImages
                .filter(i => !candidateSet.has(i.id))
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              const removeCandidate = (id: string) =>
                setStoryCandidateIds(prev => (prev ?? []).filter(x => x !== id))
              const addCandidate = (id: string) =>
                setStoryCandidateIds(prev => {
                  const base = prev ?? []
                  if (base.includes(id)) return base
                  if (base.length >= STORY_GENERATE_MAX_PHOTOS) return base
                  return [...base, id]
                })
              const reorder = (from: string, to: string) => {
                if (from === to) return
                setStoryCandidateIds(prev => {
                  const base = (prev ?? []).slice()
                  const fromIdx = base.indexOf(from)
                  const toIdx = base.indexOf(to)
                  if (fromIdx === -1 || toIdx === -1) return base
                  const [moved] = base.splice(fromIdx, 1)
                  base.splice(toIdx, 0, moved)
                  return base
                })
              }
              const tooFew = candidates.length < STORY_GENERATE_MIN_PHOTOS
              const tooMany = candidates.length > STORY_GENERATE_MAX_PHOTOS
              return (
                <div style={{
                  margin: '0 0 18px',
                  border: `1px solid ${tooFew || tooMany ? '#d97706' : border}`,
                  background: bgSubtle,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', gap: 10,
                    padding: '12px 14px 8px',
                  }}>
                    <div style={{
                      fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                      color: textMuted, textTransform: 'uppercase',
                    }}>תמונות בסטורי · {candidates.length} / {STORY_GENERATE_MAX_PHOTOS}</div>
                    <button
                      type="button"
                      onClick={() => setStoryShowAddPicker(v => !v)}
                      style={{
                        background: 'transparent', border: 'none',
                        color: textPrimary, cursor: 'pointer',
                        fontSize: 11, fontWeight: 500,
                        letterSpacing: '0.06em', fontFamily: 'inherit',
                      }}
                    >
                      {storyShowAddPicker ? '✕ סגור' : '+ הוסף עוד תמונות'}
                    </button>
                  </div>
                  {/* Selected strip — drag to reorder, ✕ to remove. RTL flow */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 6,
                    padding: '0 14px 12px', maxHeight: 168, overflowY: 'auto',
                  }}>
                    {ordered.map(img => {
                      const isDragSrc = storyDraggedId === img.id
                      const isDropTgt = storyDragOverId === img.id && storyDraggedId && storyDraggedId !== img.id
                      return (
                        <div
                          key={img.id}
                          draggable
                          onDragStart={(e) => {
                            setStoryDraggedId(img.id)
                            e.dataTransfer.effectAllowed = 'move'
                            try { e.dataTransfer.setData('text/plain', img.id) } catch {}
                          }}
                          onDragOver={(e) => {
                            if (!storyDraggedId || storyDraggedId === img.id) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (storyDragOverId !== img.id) setStoryDragOverId(img.id)
                          }}
                          onDragLeave={() => { if (storyDragOverId === img.id) setStoryDragOverId(null) }}
                          onDrop={(e) => {
                            if (!storyDraggedId) return
                            e.preventDefault()
                            const src = storyDraggedId
                            setStoryDraggedId(null); setStoryDragOverId(null)
                            if (src && src !== img.id) reorder(src, img.id)
                          }}
                          onDragEnd={() => { setStoryDraggedId(null); setStoryDragOverId(null) }}
                          style={{
                            position: 'relative', width: 52, height: 52,
                            cursor: 'grab',
                            opacity: isDragSrc ? 0.4 : 1,
                            outline: isDropTgt ? `2px solid ${textPrimary}` : 'none',
                            outlineOffset: -2,
                            transition: 'opacity .15s',
                          }}
                          title="גרור לסידור · לחץ ✕ להסרה"
                        >
                          <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                            alt="" loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: border }} />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeCandidate(img.id) }}
                            aria-label="הסר תמונה מהסטורי"
                            style={{
                              position: 'absolute', top: -4, insetInlineEnd: -4,
                              width: 16, height: 16, borderRadius: '50%',
                              background: '#fff', border: `1px solid ${border}`,
                              color: textPrimary, cursor: 'pointer', fontSize: 10, lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: 0,
                            }}
                          >✕</button>
                        </div>
                      )
                    })}
                    {ordered.length === 0 && (
                      <div style={{ fontSize: 12, color: textMuted, padding: '8px 0' }}>
                        אין תמונות שנבחרו. לחץ "הוסף עוד תמונות" כדי לבחור.
                      </div>
                    )}
                  </div>

                  {/* Inline picker for adding more from the rest of the gallery */}
                  {storyShowAddPicker && (
                    <div style={{
                      borderTop: `1px solid ${border}`, padding: '10px 14px 14px',
                      maxHeight: 280, overflowY: 'auto',
                    }}>
                      <div style={{ fontSize: 11, color: textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                        לחץ על תמונה כדי להוסיף אותה לסוף הסטורי. תמונות שכבר נכללות מודגשות.
                      </div>
                      {additionalPool.length === 0 ? (
                        <div style={{ fontSize: 12, color: textMuted }}>אין תמונות נוספות בגלריה.</div>
                      ) : (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                          gap: 4,
                        }}>
                          {additionalPool.map(img => {
                            const reachedMax = candidates.length >= STORY_GENERATE_MAX_PHOTOS
                            return (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => addCandidate(img.id)}
                                disabled={reachedMax}
                                title={reachedMax ? `מקסימום ${STORY_GENERATE_MAX_PHOTOS} תמונות` : 'הוסף לסטורי'}
                                style={{
                                  padding: 0, border: 'none', background: 'transparent',
                                  aspectRatio: '1', cursor: reachedMax ? 'not-allowed' : 'pointer',
                                  opacity: reachedMax ? 0.4 : 1,
                                  position: 'relative',
                                }}
                              >
                                <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                                  alt="" loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: border }} />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bounds warning — keep the photographer inside the
                      12-60 sweet spot the Lambda is tuned for. */}
                  {(tooFew || tooMany) && (
                    <div style={{
                      fontSize: 11, color: '#b45309', padding: '0 14px 12px', lineHeight: 1.5,
                    }}>
                      {tooFew && <>צריך לפחות <strong>{STORY_GENERATE_MIN_PHOTOS}</strong> תמונות כדי לייצר סטורי קולח.</>}
                      {tooMany && <>מקסימום <strong>{STORY_GENERATE_MAX_PHOTOS}</strong> תמונות לסטורי אחד.</>}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Style picker — all 5 desktop styles. Phase 1 only renders
                "clean" in the stubbed endpoint; the rest will be wired as
                their Remotion compositions land. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {STORY_STYLES.map(s => {
                const selected = storyGenStyle === s.id
                return (
                  <label key={s.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px',
                    border: `1px solid ${selected ? textPrimary : border}`,
                    background: selected ? bgSubtle : '#fff',
                    cursor: 'pointer', transition: 'background .15s, border-color .15s',
                  }}>
                    <input
                      type="radio"
                      name="story-style"
                      value={s.id}
                      checked={selected}
                      onChange={() => setStoryGenStyle(s.id)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: textPrimary, marginBottom: 2 }}>
                        {s.label} <span style={{ color: textMuted, fontWeight: 400 }}>— {s.description}</span>
                      </div>
                      <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.55 }}>
                        {s.hint} · ~{s.approxDurationSec} שניות
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Time estimate — dynamic, computed from the actual photo count
                + selected style. Updates as the photographer edits the
                curator. Phase 2's Lambda is the source of truth; this is
                the calibrated estimate the user plans around. */}
            {(() => {
              const count = (storyCandidateIds?.length ?? STORY_DEFAULT_PHOTO_BUDGET)
              const estSec = estimateRenderSeconds(Math.max(count, STORY_MIN_PHOTOS), storyGenStyle)
              return (
                <div style={{
                  fontSize: 12, color: textMuted, lineHeight: 1.55,
                  marginBottom: 22, padding: '10px 12px',
                  border: `1px dashed ${border}`,
                }}>
                  <strong style={{ color: textSecondary }}>זמן רינדור משוער: {formatStoryDuration(estSec)}</strong>
                  &nbsp;עבור {count} תמונות בסגנון {STORY_STYLES.find(s => s.id === storyGenStyle)?.label ?? storyGenStyle}. הסטורי יישמר בגלריה כשיהיה מוכן ותקבל הודעה — אפשר לעזוב את המסך.
                </div>
              )
            })()}

            </div>
            {/* Sticky footer — always visible. Hairline divider keeps it
                visually attached to the scrollable body above. */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              padding: '14px 28px 18px',
              borderTop: `1px solid ${border}`, background: '#fff',
              flexShrink: 0,
            }}>
              <button
                onClick={() => { if (!storyGenerating) setShowStoryStyleModal(false) }}
                disabled={storyGenerating}
                style={{
                  background: 'transparent', color: textPrimary,
                  border: `1px solid ${border}`,
                  borderRadius: 2, padding: '11px 22px', fontSize: 11,
                  cursor: storyGenerating ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
                  opacity: storyGenerating ? 0.5 : 1,
                }}
              >
                ביטול
              </button>
              {(() => {
                const count = storyCandidateIds?.length ?? 0
                const tooFew = count < STORY_GENERATE_MIN_PHOTOS
                const tooMany = count > STORY_GENERATE_MAX_PHOTOS
                const blocked = tooFew || tooMany
                const disabled = storyGenerating || blocked
                return (
                  <button
                    onClick={() => { void handleGenerateStoryConfirm() }}
                    disabled={disabled}
                    style={{
                      background: textPrimary, color: '#fff',
                      border: `1px solid ${textPrimary}`,
                      borderRadius: 2, padding: '11px 26px', fontSize: 11,
                      cursor: storyGenerating ? 'wait' : blocked ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontWeight: 500,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    {storyGenerating ? 'מייצר…' : `צור סטורי · ${count}`}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Existing <ToastContainer /> near the top of the JSX already covers
          every dashboard toast — including the Stories Phase 1 generation
          flow — so no separate Story-specific container needed. */}
      </div>

      {/* Confirm-modal host. Rendered at the dashboard root so every
          destructive handler (deleteSection / bulkDeleteSelected /
          deleteSingleImage / …) can await a styled, RTL-correct confirm
          instead of the native window.confirm() dialog. See
          components/useConfirm.ts. */}
      <ConfirmHost />
    </div>
  )
}
