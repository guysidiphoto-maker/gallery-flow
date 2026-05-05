import React, { useState, useEffect, useRef } from 'react'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { supabase } from '../supabase'
import { uploadMany } from '../lib/uploadPipeline'
import { getMyTokenBalance, startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { Icon, type IconName } from '../components/Icon'

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
}

// Light editorial theme — Pixieset-inspired. Sage green CTA, near-black
// type, generous whitespace, no glow / no gradients except where strictly
// needed (logo mark, primary button hover).
const accent = '#2DC479'        // sage green CTA + status dots
const accentLight = '#3DD68B'   // hover state
const accentGlow = 'rgba(45,196,121,.20)'
const bg = '#ffffff'            // page background
const bgSubtle = '#f7f8fa'      // input backgrounds, hover surfaces
const card = '#ffffff'
const cardSolid = '#ffffff'
const border = '#e6e8ec'        // hairline 1px borders
const borderHover = '#cdd1d8'
const textPrimary = '#0f172a'   // near-black, used for headings
const textSecondary = '#475569' // body copy
const textMuted = '#94a3b8'     // hints, secondary metadata
const glass = '#fafbfc'

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
  `
  document.head.appendChild(style)
}

export function Dashboard() {
  const { user, loading } = useAuth()
  const [galleries, setGalleries] = useState<Gallery[]>([])
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
  const [editTab, setEditTab] = useState<'photos' | 'settings' | 'activities' | 'sections' | 'welcome'>('photos')
  const [sections, setSections] = useState<Array<{ id: string; name: string; sort_order: number }>>([])
  const [newSectionName, setNewSectionName] = useState('')
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
  const [uploading, setUploading] = useState(false)
  const [uploadBatch, setUploadBatch] = useState<{ completed: number; total: number; failed: number; current?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // New delivery settings state
  const [welcomeStyle, setWelcomeStyle] = useState<'mosaic' | 'cinematic' | 'minimal'>('mosaic')
  const [clientHidePhotosEnabled, setClientHidePhotosEnabled] = useState(false)
  const [requireGalleryCode, setRequireGalleryCode] = useState(false)
  const [galleryCode, setGalleryCode] = useState('')
  const [trackDownloads, setTrackDownloads] = useState(false)
  const [feedLayout, setFeedLayout] = useState<'grid' | 'masonry' | 'carousel'>('grid')

  useEffect(() => {
    if (!user) return
    initBusiness()
  }, [user])

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
      delivery_settings: {
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
    fetchGalleries()
  }

  async function openGalleryEditor(g: Gallery) {
    setEditingGallery(g)
    setEditTab('photos')
    const [imagesRes, sectionsRes] = await Promise.all([
      supabase
        .from('images')
        .select('id, filename, storage_path, thumbnail_path, is_top_pick, sort_order')
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('gallery_sections')
        .select('id, name, sort_order')
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
    ])
    setGalleryImages(imagesRes.data ?? [])
    setSections(sectionsRes.data ?? [])
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

  async function updateGallerySetting(key: string, value: unknown) {
    if (!editingGallery) return
    const settings = { ...(editingGallery.delivery_settings || {}), [key]: value }
    await supabase.from('galleries').update({ delivery_settings: settings }).eq('id', editingGallery.id)
    setEditingGallery({ ...editingGallery, delivery_settings: settings })
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

  const imgUrl = (path: string) => `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/${path}`

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
  const publishedCount = galleries.filter((g) => g.status === 'published').length
  const draftCount = galleries.filter((g) => g.status !== 'published').length

  const statCards: { label: string; value: number | string; icon: string; color: string }[] = [
    { label: 'סה"כ גלריות', value: galleries.length, icon: '🖼', color: accent },
    { label: 'סה"כ תמונות', value: totalPhotos, icon: '📷', color: '#a78bfa' },
    { label: 'פורסמו', value: publishedCount, icon: '✅', color: '#22c55e' },
    { label: 'טיוטות', value: draftCount, icon: '📝', color: '#facc15' },
  ]

  return (
    <div style={{
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

        {/* Logo */}
        <a href="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 6px 24px',
          textDecoration: 'none', color: textPrimary,
          fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
            boxShadow: `0 8px 20px ${accentGlow}`,
            color: '#fff',
          }}>
            <Icon name="logo" size={18} strokeWidth={2} />
          </span>
          Pixflow
        </a>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {[
            { icon: 'gallery' as IconName, label: 'הגלריות שלי', active: true, disabled: false },
            { icon: 'palette' as IconName,  label: 'מיתוג',       active: false, disabled: true },
            { icon: 'clients' as IconName,  label: 'לקוחות',      active: false, disabled: true },
            { icon: 'help' as IconName,     label: 'עזרה',        active: false, disabled: false },
          ].map(item => (
            <button key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: item.active ? `rgba(45,196,121,.14)` : 'transparent',
              border: `1px solid ${item.active ? 'rgba(45,196,121,.25)' : 'transparent'}`,
              color: item.active ? '#16a274' : (item.disabled ? textMuted : textSecondary),
              fontSize: 13, fontWeight: item.active ? 600 : 500,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', textAlign: 'right' as const,
              opacity: item.disabled ? 0.55 : 1,
              transition: 'all .15s',
            }}>
              <Icon name={item.icon} size={17} strokeWidth={1.85} style={{ opacity: 0.9 }} />
              <span>{item.label}</span>
              {item.disabled && (
                <span style={{
                  marginInlineStart: 'auto', fontSize: 9, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 5,
                  background: 'rgba(0,0,0,.03)', color: textMuted,
                  letterSpacing: '0.04em',
                }}>בקרוב</span>
              )}
            </button>
          ))}
        </nav>

        {/* Token balance card */}
        <button
          onClick={() => setShowBuyTokens(true)}
          style={{
            background: tokenBalance < 50
              ? `linear-gradient(135deg, rgba(239,68,68,.18), rgba(220,38,38,.06))`
              : `linear-gradient(135deg, rgba(45,196,121,.18), rgba(61,214,139,.06))`,
            border: `1px solid ${tokenBalance < 50 ? 'rgba(239,68,68,.35)' : 'rgba(45,196,121,.30)'}`,
            borderRadius: 14, padding: '14px 16px',
            cursor: 'pointer', fontFamily: 'inherit',
            color: textPrimary, textAlign: 'right' as const,
            transition: 'all .2s',
            marginBottom: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = '' }}
        >
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 600, letterSpacing: '.04em' }}>
            יתרת טוקנים
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: tokenBalance < 50 ? '#fca5a5' : '#16a274', marginBottom: 8, letterSpacing: '-0.02em' }}>
            {tokenBalance.toLocaleString('he-IL')}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: tokenBalance < 50 ? '#fca5a5' : '#16a274',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {tokenBalance < 50 ? '⚠️ קנה עוד' : '+ קנה טוקנים'}
          </div>
        </button>

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

        {/* Page heading + CTA — Pixieset rhythm: editorial title left, primary
            CTA right, minimal subtitle. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28, animation: 'fadeInUp .4s ease both',
          gap: 20, flexWrap: 'wrap',
        }}>
          <h1 style={{
            fontSize: 38, fontWeight: 800, margin: 0,
            letterSpacing: '-0.035em', lineHeight: 1.1, color: textPrimary,
          }}>
            הגלריות שלי
          </h1>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: accent,
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background .15s',
              letterSpacing: '0.01em',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = accentLight }}
            onMouseLeave={(e) => { e.currentTarget.style.background = accent }}
          >
            <Icon name="plus" size={15} strokeWidth={2.4} />
            גלריה חדשה
          </button>
        </div>

        {/* ======= Stats row ======= */}
        {!loadingGalleries && galleries.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16, marginBottom: 40,
            animation: 'fadeInUp .45s ease both',
          }}>
            {statCards.map((s, i) => (
              <div key={i} style={{
                background: card,
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                borderRadius: 16, padding: '22px 24px',
                border: `1px solid ${border}`,
                transition: 'border-color .25s, transform .2s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, color: textMuted, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: s.color }}>
                  {s.value}
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
          /* ======= Empty state — first-time photographer onboarding ======= */
          <div style={{
            textAlign: 'center', padding: '60px 24px 100px',
            animation: 'fadeInUp .5s ease both',
            position: 'relative',
          }}>
            {/* Welcome hero card */}
            <div style={{
              maxWidth: 720, margin: '0 auto 32px',
              padding: '48px 32px',
              borderRadius: 28,
              background: `linear-gradient(135deg, rgba(45,196,121,.12), rgba(167,139,250,.06))`,
              border: `1px solid rgba(45,196,121,.18)`,
              boxShadow: '0 18px 60px rgba(45,196,121,.10)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Decorative glow */}
              <div style={{
                position: 'absolute', top: -80, right: -80,
                width: 240, height: 240, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(45,196,121,.18), transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                width: 88, height: 88, borderRadius: 24, margin: '0 auto 24px',
                background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 16px 40px ${accentGlow}`,
                position: 'relative',
                color: '#fff',
              }}>
                <Icon name="logo" size={42} strokeWidth={1.85} />
              </div>
              <h2 style={{
                fontSize: 32, fontWeight: 800, marginBottom: 14, color: textPrimary,
                letterSpacing: '-0.025em', position: 'relative',
              }}>
                ברוך הבא ל-Pixflow
              </h2>
              <p style={{
                color: textSecondary, fontSize: 17, marginBottom: 14, lineHeight: 1.65,
                maxWidth: 520, marginInline: 'auto',
              }}>
                גלריות מהירות, פרטיות ויפות לאירועים. עם זיהוי פנים אופציונלי שמאפשר לאורחים למצוא את עצמם בסלפי.
              </p>
              <p style={{
                color: '#16a274', fontSize: 13, marginBottom: 32, fontWeight: 600,
              }}>
                ✨ קיבלת 100 טוקנים חינם להתחלה — מספיק לעלות 100 תמונות
              </p>
              <div style={{
                display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    background: `linear-gradient(135deg, ${accent}, ${accentLight})`, color: '#fff',
                    border: 'none', borderRadius: 14, padding: '16px 32px', fontSize: 15,
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'transform .15s, box-shadow .15s',
                    boxShadow: `0 6px 24px ${accentGlow}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(45,196,121,.4)` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 6px 24px ${accentGlow}` }}
                >
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  צור גלריה ראשונה
                </button>
                <a
                  href="/demo"
                  target="_blank"
                  rel="noopener"
                  style={{
                    textDecoration: 'none',
                    background: 'transparent', color: textPrimary,
                    border: `1px solid ${border}`, borderRadius: 14, padding: '16px 28px', fontSize: 15,
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all .15s',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,196,121,.5)'; e.currentTarget.style.background = 'rgba(45,196,121,.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = 'transparent' }}
                >
                  <Icon name="arrow-out" size={18} strokeWidth={2} />
                  נסה את הדמו
                </a>
              </div>
            </div>

            {/* Three feature highlights below */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16, maxWidth: 720, margin: '0 auto',
            }}>
              {[
                { icon: 'bolt' as IconName,        title: 'מהיר במיוחד', desc: 'שלוש שכבות איכות לכל תמונה — גלריות נטענות מהר אצל הלקוח, לא משנה כמה תמונות' },
                { icon: 'shield' as IconName,      title: 'פרטי ובטוח',   desc: 'הגנת סיסמה אמיתית בצד השרת — לא מסך שעוקפים בדפדפן' },
                { icon: 'face-search' as IconName, title: 'זיהוי פנים',   desc: 'אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד' },
              ].map(f => (
                <div key={f.title} style={{
                  padding: '24px 22px', borderRadius: 18,
                  background: card, border: `1px solid ${border}`,
                  textAlign: 'right' as const,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, marginBottom: 14,
                    background: 'rgba(45,196,121,.12)',
                    border: '1px solid rgba(45,196,121,.25)',
                    color: '#16a274',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={f.icon} size={18} strokeWidth={1.85} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary, marginBottom: 6, letterSpacing: '-0.01em' }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>
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
              const cover = ((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined) || null
              return (
                <div
                  key={g.id}
                  style={{
                    background: card,
                    borderRadius: 4,
                    cursor: 'pointer',
                    animation: `fadeInUp .4s ease both`,
                    animationDelay: `${idx * 0.04}s`,
                    transition: 'transform .25s ease',
                    transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
                  }}
                  onClick={() => openGalleryEditor(g)}
                  onMouseEnter={() => setHoveredCard(g.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* Cover image — hero */}
                  <div style={{
                    aspectRatio: '4 / 3', borderRadius: 4, overflow: 'hidden',
                    background: cover ? '#f1f5f9' : `linear-gradient(135deg, #f1f5f9, #e2e8f0)`,
                    position: 'relative',
                    boxShadow: isHovered ? '0 14px 36px rgba(15,23,42,.12)' : '0 2px 8px rgba(15,23,42,.06)',
                    transition: 'box-shadow .25s ease',
                  }}>
                    {cover && (
                      <img
                        src={cover}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                    {!cover && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#cbd5e1',
                      }}>
                        <Icon name="photo" size={42} strokeWidth={1.4} />
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
                          style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: 'rgba(255,255,255,.94)', border: 'none',
                            color: textPrimary, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 2px 6px rgba(15,23,42,.15)',
                          }}
                        >
                          <Icon name={copiedGalleryId === g.id ? 'check' : 'copy'} size={15} strokeWidth={2} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEmailShare(g) }}
                          title="שלח במייל ללקוח"
                          style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: 'rgba(255,255,255,.94)', border: 'none',
                            color: textPrimary, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 2px 6px rgba(15,23,42,.15)',
                          }}
                        >
                          <Icon name="mail" size={15} strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '14px 2px 0' }}>
                    <h3 style={{
                      fontSize: 17, fontWeight: 700, margin: '0 0 8px',
                      letterSpacing: '-0.015em', lineHeight: 1.25, color: textPrimary,
                    }}>
                      {g.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: textSecondary }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: isLive ? accent : '#cbd5e1',
                        }} />
                        {(g.image_count ?? 0).toLocaleString('he-IL')} תמונות
                      </span>
                      {g.published_at && (
                        <>
                          <span style={{ color: textMuted }}>·</span>
                          <span>{new Date(g.published_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </>
                      )}
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
        {editingGallery && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'stretch', justifyContent: 'center',
            animation: 'overlayIn .2s ease both',
          }} onClick={() => setEditingGallery(null)}>
            <div style={{
              background: bg, width: '100%', maxWidth: 1000, margin: '20px',
              borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              border: `1px solid ${border}`, animation: 'modalIn .3s ease both',
            }} onClick={e => e.stopPropagation()}>
              {/* Editor header */}
              <div style={{
                padding: '20px 28px', borderBottom: `1px solid ${border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={() => setEditingGallery(null)} style={{
                    background: 'none', border: 'none', color: textSecondary, cursor: 'pointer', fontSize: 20, padding: 4,
                  }}>←</button>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{editingGallery.name}</h2>
                    <p style={{ fontSize: 12, color: textMuted, margin: '2px 0 0' }}>{galleryImages.length} תמונות · {editingGallery.status === 'live' ? 'פורסם' : 'טיוטה'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <a href={`/gallery/${editingGallery.id}`} target="_blank" style={{
                    padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: glass, border: `1px solid ${border}`, color: textSecondary,
                    textDecoration: 'none', fontFamily: 'inherit',
                  }}>👁 תצוגה מקדימה</a>
                  {editingGallery.status !== 'live' && (
                    <button onClick={publishGallery} style={{
                      padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: `linear-gradient(135deg, ${accent}, ${accentLight})`, border: 'none',
                      color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: `0 4px 16px ${accentGlow}`,
                    }}>פרסם גלריה</button>
                  )}
                </div>
              </div>

              {/* Editor tabs */}
              <div style={{
                display: 'flex', gap: 4, padding: '12px 28px', borderBottom: `1px solid ${border}`,
                background: bgSubtle,
              }}>
                {([
                  { id: 'photos' as const,     icon: 'photo'    as IconName, label: 'תמונות' },
                  { id: 'sections' as const,   icon: 'sections' as IconName, label: 'קטעים' },
                  { id: 'activities' as const, icon: 'activity' as IconName, label: 'פעילות' },
                  { id: 'settings' as const,   icon: 'settings' as IconName, label: 'הגדרות' },
                  { id: 'welcome' as const,    icon: 'bolt'     as IconName, label: 'מסך פתיחה' },
                ]).map(t => (
                  <button key={t.id} onClick={() => setEditTab(t.id)} style={{
                    padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: editTab === t.id ? 600 : 500, fontFamily: 'inherit',
                    background: editTab === t.id ? `rgba(45,196,121,.18)` : 'transparent',
                    color: editTab === t.id ? accentLight : textSecondary,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all .15s',
                  }}>
                    <Icon name={t.icon} size={15} strokeWidth={1.85} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Editor content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>

                {/* ── Photos Tab ── */}
                {editTab === 'photos' && (
                  <div>
                    {/* Bulk action toolbar */}
                    {selectMode && (
                      <div style={{
                        position: 'sticky', top: 0, zIndex: 10,
                        marginBottom: 16, padding: '12px 18px', borderRadius: 14,
                        background: 'rgba(45,196,121,.14)',
                        border: `1px solid rgba(45,196,121,.35)`,
                        backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', gap: 12,
                        animation: 'fadeIn .2s ease',
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#16a274' }}>
                          {selectedImageIds.size} {selectedImageIds.size === 1 ? 'תמונה נבחרה' : 'תמונות נבחרו'}
                        </span>
                        <button onClick={selectAllImages} style={{
                          marginInlineStart: 'auto',
                          background: 'transparent', border: `1px solid ${border}`, borderRadius: 8,
                          color: textSecondary, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>בחר הכל</button>
                        <button onClick={() => bulkToggleTopPick(true)} style={{
                          background: 'rgba(250,204,21,.12)', border: '1px solid rgba(250,204,21,.3)',
                          borderRadius: 8, color: '#fde047', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                        }}>★ סמן כמועדף</button>
                        <button onClick={() => bulkToggleTopPick(false)} style={{
                          background: 'transparent', border: `1px solid ${border}`,
                          borderRadius: 8, color: textSecondary, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>בטל סימון</button>
                        <button onClick={bulkDeleteSelected} style={{
                          background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.35)',
                          borderRadius: 8, color: '#fca5a5', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 600,
                        }}>מחק</button>
                        <button onClick={exitSelectMode} style={{
                          background: 'transparent', border: 'none',
                          color: textMuted, padding: '6px 8px', fontSize: 14, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>×</button>
                      </div>
                    )}

                    {/* Upload area */}
                    <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
                      onChange={e => handleFileUpload(e.target.files)} />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = accent }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,.06)' }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(0,0,0,.06)'; handleFileUpload(e.dataTransfer.files) }}
                      style={{
                        border: '2px dashed rgba(0,0,0,.06)', borderRadius: 16,
                        padding: '48px 28px', textAlign: 'center', cursor: 'pointer',
                        background: glass, transition: 'border-color .2s, background .2s',
                        marginBottom: 28,
                      }}
                    >
                      {uploading && uploadBatch ? (
                        <div>
                          <div style={{ fontSize: 14, color: accentLight, fontWeight: 600, marginBottom: 4 }}>
                            מעלה תמונות {uploadBatch.completed} / {uploadBatch.total}
                            {uploadBatch.failed > 0 && (
                              <span style={{ color: '#fca5a5', marginRight: 8, fontSize: 12 }}>
                                ({uploadBatch.failed} נכשלו)
                              </span>
                            )}
                          </div>
                          {uploadBatch.current && (
                            <div style={{ fontSize: 11, color: textMuted, marginBottom: 8, direction: 'ltr', textAlign: 'right' }}>
                              {uploadBatch.current}
                            </div>
                          )}
                          <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'rgba(0,0,0,.04)', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.round((uploadBatch.completed / Math.max(1, uploadBatch.total)) * 100)}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, ${accent}, ${accentLight})`,
                              borderRadius: 4, transition: 'width .3s',
                            }} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📁</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>גררו תמונות לכאן</div>
                          <div style={{ fontSize: 13, color: textMuted }}>או לחצו לבחירת קבצים · JPG, PNG, WebP</div>
                        </>
                      )}
                    </div>

                    {/* Image grid */}
                    {galleryImages.length > 0 && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6,
                        borderRadius: 12, overflow: 'hidden',
                      }}>
                        {galleryImages.map(img => {
                          const isSelected = selectedImageIds.has(img.id)
                          return (
                            <div
                              key={img.id}
                              onClick={() => {
                                if (!selectMode) { setSelectMode(true); setSelectedImageIds(new Set([img.id])); return }
                                setSelectedImageIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(img.id)) next.delete(img.id); else next.add(img.id)
                                  if (next.size === 0) setSelectMode(false)
                                  return next
                                })
                              }}
                              style={{
                                position: 'relative', aspectRatio: '1', overflow: 'hidden',
                                background: 'rgba(0,0,0,.02)',
                                cursor: 'pointer',
                                outline: isSelected ? `3px solid ${accent}` : 'none',
                                outlineOffset: isSelected ? -3 : 0,
                                transform: isSelected ? 'scale(0.96)' : 'scale(1)',
                                transition: 'transform .15s ease, outline-offset .15s',
                              }}
                            >
                              <img
                                src={imgUrl(img.thumbnail_path || img.storage_path)}
                                alt="" loading="lazy"
                                style={{
                                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                                  filter: isSelected ? 'brightness(0.7)' : 'none',
                                  transition: 'filter .15s',
                                }}
                              />
                              {img.is_top_pick && (
                                <div style={{
                                  position: 'absolute', top: 4, right: 4,
                                  background: 'rgba(45,196,121,.85)', color: '#fff',
                                  fontSize: 8, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                                }}>★</div>
                              )}
                              {selectMode && (
                                <div style={{
                                  position: 'absolute', top: 6, left: 6,
                                  width: 22, height: 22, borderRadius: '50%',
                                  background: isSelected ? accent : 'rgba(0,0,0,.6)',
                                  border: `2px solid ${isSelected ? accent : 'rgba(255,255,255,.7)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all .15s',
                                }}>
                                  {isSelected && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {galleryImages.length === 0 && !uploading && (
                      <p style={{ textAlign: 'center', color: textMuted, fontSize: 14, padding: '40px 0' }}>
                        אין עדיין תמונות בגלריה הזו. העלו תמונות למעלה.
                      </p>
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

                {/* ── Activities Tab ── */}
                {editTab === 'activities' && (
                  <div style={{ padding: '0 4px' }}>
                    {activityLoading && !activitySummary ? (
                      <div style={{ textAlign: 'center', padding: '60px 0', color: textMuted }}>
                        <div style={{
                          width: 28, height: 28, margin: '0 auto 16px',
                          border: `3px solid ${border}`, borderTopColor: accent,
                          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                        טוען נתוני פעילות...
                      </div>
                    ) : !activitySummary || (activitySummary.downloads_total === 0 && activitySummary.favorites_total === 0 && activitySummary.emails_total === 0) ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{ marginBottom: 18, opacity: 0.5, color: textMuted, display: 'flex', justifyContent: 'center' }}>
                          <Icon name="activity" size={42} strokeWidth={1.5} />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, margin: '0 0 8px' }}>
                          עדיין אין פעילות
                        </h3>
                        <p style={{ color: textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 380, marginInline: 'auto' }}>
                          אחרי שתשתף את הקישור עם הלקוח ותחילו ההורדות, תראה כאן הכל — הורדות, מועדפים, ושיתופים.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Stat cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
                          {[
                            { label: 'הורדות', value: activitySummary.downloads_total, color: '#16a274', icon: '⬇️' },
                            { label: 'מועדפים', value: activitySummary.favorites_total, color: '#fca5a5', icon: '♥' },
                            { label: 'שיתופי מייל', value: activitySummary.emails_total, color: '#86efac', icon: '✉️' },
                          ].map(s => (
                            <div key={s.label} style={{
                              padding: '20px 22px', borderRadius: 16,
                              background: card, border: `1px solid ${border}`,
                            }}>
                              <div style={{ fontSize: 11, color: textMuted, marginBottom: 8, letterSpacing: '.04em', display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span>{s.icon}</span>
                                <span>{s.label}</span>
                              </div>
                              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>
                                {s.value.toLocaleString('he-IL')}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Recent downloads */}
                        {activitySummary.recent_downloads.length > 0 && (
                          <section style={{ marginBottom: 28 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: textPrimary, margin: '0 0 12px', letterSpacing: '.02em' }}>
                              הורדות אחרונות
                            </h4>
                            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
                              {activitySummary.recent_downloads.slice(0, 10).map(d => {
                                const img = galleryImages.find(g => g.id === d.image_id)
                                return (
                                  <div key={d.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 16px', borderBottom: `1px solid ${border}`,
                                    fontSize: 12,
                                  }}>
                                    <span style={{ color: textMuted, minWidth: 100 }}>
                                      {new Date(d.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span style={{ flex: 1, color: textPrimary, direction: 'ltr', textAlign: 'right' }}>
                                      {img?.filename ?? '(תמונה נמחקה)'}
                                    </span>
                                    <span style={{
                                      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                      background: d.resolution === 'original' ? 'rgba(34,197,94,.14)' : 'rgba(45,196,121,.14)',
                                      color: d.resolution === 'original' ? '#4ade80' : '#16a274',
                                    }}>
                                      {d.resolution === 'original' ? 'מקור' : 'web'}
                                    </span>
                                    {d.download_kind === 'batch' && (
                                      <span style={{ fontSize: 10, color: textMuted }}>📦</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        )}

                        {/* Recent favorites */}
                        {activitySummary.recent_favorites.length > 0 && (
                          <section style={{ marginBottom: 28 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: textPrimary, margin: '0 0 12px', letterSpacing: '.02em' }}>
                              מועדפים אחרונים
                            </h4>
                            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
                              {activitySummary.recent_favorites.slice(0, 10).map(f => {
                                const img = galleryImages.find(g => g.id === f.image_id)
                                return (
                                  <div key={f.id} style={{
                                    padding: '10px 16px', borderBottom: `1px solid ${border}`,
                                    fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4,
                                  }}>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                      <span style={{ color: textMuted, minWidth: 100 }}>
                                        {new Date(f.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      <span style={{ flex: 1, color: textPrimary, direction: 'ltr', textAlign: 'right' }}>
                                        {img?.filename ?? '(תמונה נמחקה)'}
                                      </span>
                                      {f.guest_name && (
                                        <span style={{ fontSize: 11, color: textSecondary }}>— {f.guest_name}</span>
                                      )}
                                    </div>
                                    {f.note && (
                                      <div style={{ fontSize: 11, color: textSecondary, fontStyle: 'italic', paddingRight: 112 }}>
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
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: textPrimary, margin: '0 0 12px', letterSpacing: '.02em' }}>
                              שיתופי מייל אחרונים
                            </h4>
                            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
                              {activitySummary.recent_emails.slice(0, 10).map(e => (
                                <div key={e.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '10px 16px', borderBottom: `1px solid ${border}`,
                                  fontSize: 12,
                                }}>
                                  <span style={{ color: textMuted, minWidth: 100 }}>
                                    {new Date(e.created_at).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span style={{ flex: 1, color: textPrimary, direction: 'ltr', textAlign: 'right' }}>
                                    {e.recipient_email}
                                  </span>
                                  <span style={{
                                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                    background: e.status === 'sent' ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.14)',
                                    color: e.status === 'sent' ? '#4ade80' : '#fca5a5',
                                  }}>
                                    {e.status === 'sent' ? 'נשלח' : 'נכשל'}
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
                {editTab === 'settings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: textPrimary }}>הגדרות גלריה</h3>

                    {/* Downloads */}
                    <div style={{ padding: 20, borderRadius: 14, background: glass, border: `1px solid rgba(0,0,0,.03)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📥 הורדות</div>
                      {[
                        { key: 'downloadsEnabled', label: 'אפשר הורדת תמונות', desc: 'אורחים יוכלו להוריד תמונות בודדות' },
                        { key: 'bulkDownloadEnabled', label: 'הורדה מרוכזת', desc: 'אפשר הורדת כל התמונות בבת אחת' },
                        { key: 'trackDownloads', label: 'מעקב הורדות', desc: 'עקוב מי הוריד ומתי' },
                      ].map(opt => (
                        <div key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.02)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{opt.desc}</div>
                          </div>
                          <div className={`dash-toggle ${editingGallery.delivery_settings?.[opt.key] ? 'dash-toggle-on' : 'dash-toggle-off'}`}
                            onClick={(e) => { e.stopPropagation(); updateGallerySetting(opt.key, !(editingGallery.delivery_settings?.[opt.key])) }}>
                            <div className="dash-toggle-knob" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Privacy */}
                    <div style={{ padding: 20, borderRadius: 14, background: glass, border: `1px solid rgba(0,0,0,.03)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>פרטיות</div>
                      {[
                        { key: 'clientHidePhotosEnabled', label: 'אפשר לאורחים להסתיר תמונות', desc: 'כל אורח יכול להסתיר תמונות שלו מאחרים' },
                        { key: 'clientSelectionEnabled', label: 'בחירת תמונות', desc: 'אפשר ללקוח לבחור תמונות מועדפות' },
                      ].map(opt => (
                        <div key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.02)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{opt.desc}</div>
                          </div>
                          <div className={`dash-toggle ${editingGallery.delivery_settings?.[opt.key] ? 'dash-toggle-on' : 'dash-toggle-off'}`}
                            onClick={(e) => { e.stopPropagation(); updateGallerySetting(opt.key, !(editingGallery.delivery_settings?.[opt.key])) }}>
                            <div className="dash-toggle-knob" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Face Recognition */}
                    <div style={{ padding: 20, borderRadius: 14, background: 'linear-gradient(135deg, rgba(45,196,121,.06), rgba(139,92,246,.04))', border: `1px solid rgba(45,196,121,.15)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>זיהוי פנים AI</div>
                      {[
                        { key: 'faceIndexEnabled', label: 'הפעל זיהוי פנים', desc: 'אורחים יוכלו למצוא את עצמם בסלפי' },
                      ].map(opt => (
                        <div key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.02)' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{opt.desc}</div>
                          </div>
                          <div className={`dash-toggle ${editingGallery.delivery_settings?.[opt.key] ? 'dash-toggle-on' : 'dash-toggle-off'}`}
                            onClick={async (e) => {
                              e.stopPropagation()
                              const newVal = !(editingGallery.delivery_settings?.[opt.key])
                              await updateGallerySetting(opt.key, newVal)
                              await supabase.from('galleries').update({ face_index_enabled: newVal }).eq('id', editingGallery.id)
                            }}>
                            <div className="dash-toggle-knob" />
                          </div>
                        </div>
                      ))}
                      {Boolean(editingGallery.delivery_settings?.faceIndexEnabled) && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>מצב פרטיות</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {([
                              { id: 'open', label: 'פתוח', desc: 'כולם רואים את כל התמונות + אופציה לחיפוש' },
                              { id: 'private', label: 'פרטי', desc: 'כל אורח רואה רק את התמונות שלו' },
                            ] as const).map(m => (
                              <button key={m.id} onClick={() => updateGallerySetting('facePrivacyMode', m.id)} style={{
                                flex: 1, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                                border: `2px solid ${(editingGallery.delivery_settings?.facePrivacyMode || 'open') === m.id ? accent : 'rgba(0,0,0,.04)'}`,
                                background: (editingGallery.delivery_settings?.facePrivacyMode || 'open') === m.id ? 'rgba(45,196,121,.08)' : glass,
                                fontFamily: 'inherit', textAlign: 'right' as const,
                              }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: (editingGallery.delivery_settings?.facePrivacyMode || 'open') === m.id ? accentLight : textPrimary, marginBottom: 2 }}>{m.label}</div>
                                <div style={{ fontSize: 10, color: textMuted }}>{m.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Layout */}
                    <div style={{ padding: 20, borderRadius: 14, background: glass, border: `1px solid rgba(0,0,0,.03)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>תצוגה</div>
                      <div style={{ fontSize: 12, color: textMuted, marginBottom: 10 }}>סגנון פיד</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['grid', 'masonry', 'carousel'] as const).map(l => (
                          <button key={l} onClick={() => updateGallerySetting('feedLayout', l)} style={{
                            padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                            background: (editingGallery.delivery_settings?.feedLayout || 'grid') === l ? `rgba(45,196,121,.2)` : glass,
                            color: (editingGallery.delivery_settings?.feedLayout || 'grid') === l ? accentLight : textSecondary,
                            transition: 'all .15s',
                          }}>{l === 'grid' ? 'רשת' : l === 'masonry' ? 'מוזאיקה' : 'קרוסלה'}</button>
                        ))}
                      </div>
                    </div>

                    {/* Theme color */}
                    <div style={{ padding: 20, borderRadius: 14, background: glass, border: `1px solid rgba(0,0,0,.03)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>צבע ראשי</div>
                      <div style={{ fontSize: 12, color: textMuted, marginBottom: 10 }}>הצבע שמופיע בכפתורים, מסגרות ולוגו של הגלריה</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {([
                          { id: 'indigo', label: 'אינדיגו', color: '#2DC479' },
                          { id: 'rose',   label: 'ורוד',   color: '#f43f5e' },
                          { id: 'amber',  label: 'זהב',    color: '#f59e0b' },
                          { id: 'teal',   label: 'טורקיז', color: '#14b8a6' },
                          { id: 'slate',  label: 'אפור',   color: '#64748b' },
                        ] as const).map(c => {
                          const active = (editingGallery.delivery_settings?.themeColor || 'indigo') === c.id
                          return (
                            <button key={c.id} onClick={() => updateGallerySetting('themeColor', c.id)} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                              padding: '8px 14px', borderRadius: 12,
                              background: active ? `rgba(0,0,0,.03)` : 'transparent',
                              border: `2px solid ${active ? c.color : 'rgba(0,0,0,.03)'}`,
                              cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'all .15s',
                            }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: 8,
                                background: c.color,
                                boxShadow: active ? `0 4px 16px ${c.color}66` : 'none',
                              }} />
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: active ? c.color : textMuted,
                              }}>
                                {c.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Watermark */}
                    <div style={{ padding: 20, borderRadius: 14, background: glass, border: `1px solid rgba(0,0,0,.03)` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>ווטרמרק</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.02)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>הצג ווטרמרק על תצוגות web</div>
                          <div style={{ fontSize: 11, color: textMuted }}>שם העסק יופיע בפינה — מקור ההורדה תמיד נקי</div>
                        </div>
                        <div className={`dash-toggle ${editingGallery.delivery_settings?.watermarkEnabled ? 'dash-toggle-on' : 'dash-toggle-off'}`}
                          onClick={(e) => { e.stopPropagation(); updateGallerySetting('watermarkEnabled', !(editingGallery.delivery_settings?.watermarkEnabled)) }}>
                          <div className="dash-toggle-knob" />
                        </div>
                      </div>
                      {Boolean(editingGallery.delivery_settings?.watermarkEnabled) && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>טקסט הווטרמרק (ברירת מחדל: שם העסק)</div>
                          <input
                            type="text"
                            value={String(editingGallery.delivery_settings?.watermarkText ?? '')}
                            onChange={(e) => updateGallerySetting('watermarkText', e.target.value)}
                            placeholder="© השם שלך"
                            style={{
                              width: '100%', padding: '10px 14px', borderRadius: 10,
                              background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
                              color: textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                            }}
                          />
                          <div style={{ fontSize: 12, color: textMuted, marginTop: 14, marginBottom: 8 }}>מיקום</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {([
                              { id: 'bottom-right', label: '↘' },
                              { id: 'bottom-left',  label: '↙' },
                              { id: 'top-right',    label: '↗' },
                              { id: 'top-left',     label: '↖' },
                              { id: 'center',       label: '＋' },
                            ] as const).map(p => {
                              const active = (editingGallery.delivery_settings?.watermarkPosition || 'bottom-right') === p.id
                              return (
                                <button key={p.id} onClick={() => updateGallerySetting('watermarkPosition', p.id)} style={{
                                  width: 40, height: 40, borderRadius: 10,
                                  background: active ? `rgba(45,196,121,.18)` : 'transparent',
                                  border: `1px solid ${active ? accent : border}`,
                                  color: active ? accentLight : textSecondary,
                                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 18,
                                  transition: 'all .15s',
                                }}>{p.label}</button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Welcome Screen Tab ── */}
                {editTab === 'welcome' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: textPrimary }}>מסך וואלקם</h3>
                    <p style={{ fontSize: 13, color: textMuted, margin: 0 }}>בחרו את הסגנון שיראו האורחים כשנכנסים לגלריה</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      {([
                        { id: 'mosaic' as const, label: 'מוזאיקה', desc: 'תמונות גוללות ברקע', emoji: '🖼' },
                        { id: 'cinematic' as const, label: 'קולנועי', desc: 'תמונת רקע עם אפקט זום', emoji: '🎬' },
                        { id: 'minimal' as const, label: 'מינימלי', desc: 'רקע שחור, טיפוגרפיה בלבד', emoji: '✨' },
                      ]).map(s => {
                        const active = (editingGallery.delivery_settings?.welcomeStyle || 'mosaic') === s.id
                        return (
                          <button key={s.id} onClick={() => updateGallerySetting('welcomeStyle', s.id)} style={{
                            padding: '24px 16px', borderRadius: 16, border: `2px solid ${active ? accent : 'rgba(0,0,0,.04)'}`,
                            background: active ? `rgba(45,196,121,.08)` : glass, cursor: 'pointer',
                            textAlign: 'center', fontFamily: 'inherit', transition: 'all .2s',
                            boxShadow: active ? `0 0 20px ${accentGlow}` : 'none',
                          }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{s.emoji}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: active ? accentLight : textPrimary, marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 11, color: textMuted }}>{s.desc}</div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Cover image for cinematic */}
                    {(editingGallery.delivery_settings?.welcomeStyle || 'mosaic') === 'cinematic' && galleryImages.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>בחרו תמונת רקע</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
                          {galleryImages.slice(0, 20).map(img => {
                            const isCover = editingGallery.delivery_settings?.coverImageUrl === imgUrl(img.storage_path)
                            return (
                              <div key={img.id}
                                onClick={() => updateGallerySetting('coverImageUrl', imgUrl(img.storage_path))}
                                style={{
                                  aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                                  border: `2px solid ${isCover ? accent : 'transparent'}`,
                                  opacity: isCover ? 1 : 0.6, transition: 'all .15s',
                                }}>
                                <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Gallery title */}
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: textSecondary, display: 'block', marginBottom: 6 }}>כותרת גלריה</label>
                      <input
                        value={(editingGallery.delivery_settings?.galleryTitle as string) || editingGallery.name}
                        onChange={e => updateGallerySetting('galleryTitle', e.target.value)}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10,
                          background: glass, border: `1px solid rgba(0,0,0,.05)`,
                          color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                          direction: 'rtl',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: textSecondary, display: 'block', marginBottom: 6 }}>שם לקוח</label>
                      <input
                        value={(editingGallery.delivery_settings?.clientName as string) || ''}
                        onChange={e => updateGallerySetting('clientName', e.target.value)}
                        placeholder="שם הלקוח או שם האירוע"
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10,
                          background: glass, border: `1px solid rgba(0,0,0,.05)`,
                          color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                          direction: 'rtl',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.75)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, animation: 'overlayIn .2s ease both',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: `linear-gradient(180deg, #141420 0%, ${cardSolid} 100%)`,
              borderRadius: 22, padding: '40px 36px 36px', width: '90%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto' as const,
              border: `1px solid ${border}`, direction: 'rtl',
              animation: 'modalIn .3s ease both',
              boxShadow: `0 24px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.02) inset`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 16, marginBottom: 20,
              background: `linear-gradient(135deg, rgba(45,196,121,.15), rgba(167,139,250,.1))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid rgba(45,196,121,.2)`,
            }}>
              <span style={{ fontSize: 24 }}>🖼️</span>
            </div>

            <h2 style={{
              fontSize: 22, fontWeight: 800, marginTop: 0, marginBottom: 8,
              color: textPrimary, letterSpacing: '-0.02em',
            }}>
              יצירת גלריה חדשה
            </h2>
            <p style={{ color: textMuted, fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
              מלאו את הפרטים כדי להתחיל
            </p>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 8,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                שם הגלריה
              </span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: החתונה של יוסי ומיכל"
                autoFocus
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 15,
                  fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 28 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 8,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                תאריך אירוע
              </span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 15,
                  fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </label>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

            {/* ── Welcome Screen Style ── */}
            <div style={{ marginBottom: 24 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 10,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                סגנון מסך פתיחה
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'mosaic' as const, label: 'פסיפס', icon: '◫' },
                  { value: 'cinematic' as const, label: 'קולנועי', icon: '▮' },
                  { value: 'minimal' as const, label: 'מינימלי', icon: '◻' },
                ] as const).map((opt) => {
                  const selected = welcomeStyle === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWelcomeStyle(opt.value)}
                      style={{
                        background: selected ? `rgba(45,196,121,.12)` : glass,
                        border: `1.5px solid ${selected ? accent : border}`,
                        borderRadius: 14, padding: '16px 8px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'all .2s',
                        boxShadow: selected ? `0 0 0 3px ${accentGlow}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 24, color: selected ? accentLight : textMuted, lineHeight: 1 }}>
                        {opt.icon}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: selected ? textPrimary : textSecondary,
                        letterSpacing: '0.01em', fontFamily: 'inherit',
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
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 10,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                תצוגת פיד
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'grid' as const, label: 'רשת', icon: '▦' },
                  { value: 'masonry' as const, label: 'אבן', icon: '▥' },
                  { value: 'carousel' as const, label: 'קרוסלה', icon: '▷' },
                ] as const).map((opt) => {
                  const selected = feedLayout === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFeedLayout(opt.value)}
                      style={{
                        background: selected ? `rgba(45,196,121,.12)` : glass,
                        border: `1.5px solid ${selected ? accent : border}`,
                        borderRadius: 14, padding: '16px 8px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'all .2s',
                        boxShadow: selected ? `0 0 0 3px ${accentGlow}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 24, color: selected ? accentLight : textMuted, lineHeight: 1 }}>
                        {opt.icon}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: selected ? textPrimary : textSecondary,
                        letterSpacing: '0.01em', fontFamily: 'inherit',
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

            {/* ── Client Privacy: Hide Photos Toggle ── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setClientHidePhotosEnabled(!clientHidePhotosEnabled)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    הסתרת תמונות
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    אפשרו לאורחים להסתיר תמונות מאורחים אחרים
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: clientHidePhotosEnabled ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: clientHidePhotosEnabled ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
            </div>

            {/* ── Gallery Code Toggle + Input ── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setRequireGalleryCode(!requireGalleryCode)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    קוד גישה לגלריה
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    דרשו קוד כניסה לצפייה בגלריה
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: requireGalleryCode ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: requireGalleryCode ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
              {requireGalleryCode && (
                <input
                  type="text"
                  value={galleryCode}
                  onChange={(e) => setGalleryCode(e.target.value)}
                  placeholder="הזינו קוד גישה"
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12, marginTop: 12,
                    border: `1px solid ${border}`,
                    background: bg, color: textPrimary, fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color .2s, box-shadow .2s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
                />
              )}
            </div>

            {/* ── Download Tracking Toggle ── */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setTrackDownloads(!trackDownloads)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    מעקב הורדות
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    עקבו אחרי הורדות לפי אימייל
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: trackDownloads ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: trackDownloads ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={createGallery}
                disabled={creating || !newName.trim()}
                style={{
                  flex: 1,
                  background: creating || !newName.trim()
                    ? `rgba(45,196,121,.3)`
                    : `linear-gradient(135deg, ${accent}, ${accentLight})`,
                  color: '#fff', border: 'none', borderRadius: 12,
                  padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: creating || !newName.trim() ? 0.6 : 1,
                  transition: 'all .2s',
                  boxShadow: creating || !newName.trim() ? 'none' : `0 4px 16px ${accentGlow}`,
                  letterSpacing: '0.01em',
                }}
              >
                {creating ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .6s linear infinite' }} />
                    יוצר...
                  </span>
                ) : 'צור גלריה'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, background: 'transparent', color: textSecondary,
                  border: `1px solid ${border}`,
                  borderRadius: 12, padding: '14px 0', fontSize: 15, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all .2s',
                  letterSpacing: '0.01em', fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.color = textPrimary; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = textSecondary; }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

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
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                שלח קישור במייל
              </h2>
              <button onClick={() => setShareGallery(null)} disabled={shareSending} style={{
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
              <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                קנה טוקנים
              </h2>
              <button onClick={() => setShowBuyTokens(false)} style={{
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
