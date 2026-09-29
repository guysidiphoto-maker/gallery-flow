import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { warmGalleryCache } from '@/shared/lib/warmCache'
import { fetchAllGalleryImages } from '@/shared/gallery/fetchAllImages'
import { requestFaceIndex } from '../lib/faceIndex'
import {
  IMAGE_COLUMNS_WITH_ORIGINAL, SECTION_COLUMNS, STORY_COLUMNS,
  type DesignSubTab, type EditorTab, type Gallery, type GalleryImage, type GallerySection, type Story, type Toast,
} from '../types'

// The gallery open in the editor, its loaded photos / sections / stories, the
// active tab, and publish state. Every other editor hook operates on this.
export function useEditorSession(deps: { showToast: Toast; fetchGalleries: () => void }) {
  const { showToast, fetchGalleries } = deps
  const [editingGallery, setEditingGallery] = useState<Gallery | null>(null)
  const [editTab, setEditTab] = useState<EditorTab>('photos')
  const [designSubTab, setDesignSubTab] = useState<DesignSubTab>('cover')
  // Informational only: saved edits are already live (the viewer reads
  // delivery_settings directly); the pill just prompts an explicit publish.
  const [unpublishedChanges, setUnpublishedChanges] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [justPublished, setJustPublished] = useState(false)
  const [copiedInEditor, setCopiedInEditor] = useState(false)
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])
  const [sections, setSections] = useState<GallerySection[]>([])
  // Every photo belongs to a section; null only for an empty gallery.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [stories, setStories] = useState<Story[]>([])

  // Called by every mutation that changes what the client sees.
  const markDirty = () => {
    setUnpublishedChanges(true)
  }

  async function openGalleryEditor(g: Gallery) {
    setEditingGallery(g)
    setEditTab('photos')
    setStories([])
    setUnpublishedChanges(false)
    const [imagesAll, sectionsRes, storiesRes] = await Promise.all([
      // Paginated: a plain select silently truncated galleries past 1000 rows.
      fetchAllGalleryImages<GalleryImage & { section_id?: string | null }>(g.id, IMAGE_COLUMNS_WITH_ORIGINAL),
      supabase
        .from('gallery_sections')
        .select(SECTION_COLUMNS)
        .eq('gallery_id', g.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('stories')
        .select(STORY_COLUMNS)
        .eq('gallery_id', g.id)
        .order('created_at', { ascending: true }),
    ])
    const imgs = imagesAll
    let secs = sectionsRes.data ?? []

    // Self-heal legacy photos with no section: fold them into the first
    // section (creating one if needed) so nothing is hidden.
    const loose = imgs.filter(i => i.section_id == null)
    if (loose.length > 0) {
      let target = secs[0]
      if (!target) {
        const { data } = await supabase
          .from('gallery_sections')
          .insert({ gallery_id: g.id, name: 'סקשן 1', sort_order: 0 })
          .select(SECTION_COLUMNS)
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

  async function publishGallery() {
    if (!editingGallery) return
    const wasLive = editingGallery.status === 'live'
    const publishedAt = new Date().toISOString()
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
    setUnpublishedChanges(false)
    setJustPublished(true)
    setTimeout(() => setJustPublished(false), 1800)
    showToast({ kind: 'success', text: wasLive ? 'הגלריה עודכנה ושודרה ללקוח' : 'הגלריה פורסמה ✓' })

    // Pre-warm the CDN so the first guest gets cached thumbnails.
    void warmGalleryCache(editingGallery.id)

    // Without this, FaceFinder is dead on web-published galleries.
    const settings = editingGallery.delivery_settings as { faceIndexEnabled?: boolean } | null
    if (settings?.faceIndexEnabled) requestFaceIndex(editingGallery.id)

    fetchGalleries()
  }

  // Header "Copy Link": inline confirmation on the button plus a toast.
  function copyEditorLink(url: string, galleryId: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedInEditor(true)
        setTimeout(() => setCopiedInEditor(false), 1800)
        showToast({ kind: 'success', text: 'הקישור הועתק ✓' })
      },
      () => showToast({ kind: 'error', text: 'לא הצלחנו להעתיק. העתק ידנית מהדפדפן.' }),
    )
    void warmGalleryCache(galleryId)
  }

  // More-menu "copy direct link": toast only.
  function copyDirectLink(url: string, galleryId: string) {
    navigator.clipboard.writeText(url).then(
      () => showToast({ kind: 'success', text: 'הקישור הועתק ✓' }),
      () => showToast({ kind: 'error', text: 'ההעתקה נכשלה' }),
    )
    void warmGalleryCache(galleryId)
  }

  return {
    editingGallery, setEditingGallery,
    editTab, setEditTab,
    designSubTab, setDesignSubTab,
    unpublishedChanges, setUnpublishedChanges, markDirty,
    publishing, justPublished, copiedInEditor,
    galleryImages, setGalleryImages,
    sections, setSections,
    activeSectionId, setActiveSectionId,
    stories, setStories,
    openGalleryEditor, publishGallery, copyEditorLink, copyDirectLink,
  }
}

export type EditorSession = ReturnType<typeof useEditorSession>
