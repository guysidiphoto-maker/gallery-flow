import { useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { trackAction } from '@/shared/lib/sentryContext'
import { purgeStorageForImages } from '../../lib/purgeStorage'
import { moveItem, persistSortOrder } from '../../lib/reorder'
import { SECTION_COLUMNS, type Confirm, type Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

// Photo sets ("sections") of the open gallery: CRUD, reorder, and the sidebar's
// rename / menu / description-edit / add-modal state.
export function useSections(deps: {
  session: EditorSession
  fetchGalleries: () => void
  confirm: Confirm
  showToast: Toast
}) {
  const { session, fetchGalleries, confirm, showToast } = deps
  const {
    editingGallery, galleryImages, setGalleryImages,
    sections, setSections, activeSectionId, setActiveSectionId, markDirty,
  } = session
  const [newSectionName, setNewSectionName] = useState('')
  const [newSectionDesc, setNewSectionDesc] = useState('')
  const [showAddSetModal, setShowAddSetModal] = useState(false)
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null)
  // Controlled rename draft; the cancel ref lets Escape skip the blur-save.
  const [sectionRenameDraft, setSectionRenameDraft] = useState('')
  const sectionRenameCancelledRef = useRef(false)
  const [sectionMenuOpenId, setSectionMenuOpenId] = useState<string | null>(null)
  // Inline description edit above the grid: the section id being edited.
  const [editingSectionDescId, setEditingSectionDescId] = useState<string | null>(null)
  const [sectionDescDraft, setSectionDescDraft] = useState('')

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
      .select(SECTION_COLUMNS)
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

  // Uploads always land in a section; a brand-new gallery gets a default one
  // on the fly. Returns the target section id.
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
      .select(SECTION_COLUMNS)
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

  // Empty string is persisted as null (no description).
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

  // A section is self-contained: deleting it permanently deletes its photos.
  async function deleteSection(id: string) {
    if (!editingGallery) return
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

  async function reorderSection(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const ordered = sections.slice().sort((a, b) => a.sort_order - b.sort_order)
    const next = moveItem(ordered, draggedId, targetId)
    if (!next) return
    const idToOrder = new Map<string, number>()
    next.forEach((sec, idx) => idToOrder.set(sec.id, idx * 1000))
    setSections(prev => prev
      .map(s => idToOrder.has(s.id) ? { ...s, sort_order: idToOrder.get(s.id)! } : s)
      .sort((a, b) => a.sort_order - b.sort_order))
    markDirty()
    const failedIds = await persistSortOrder('gallery_sections', next.map(s => s.id))
    if (failedIds.length > 0) {
      showToast({ kind: 'error', text: `סידור ${failedIds.length} סקשנים לא נשמר. רענן את הגלריה.` })
      console.warn('[reorderSection] failed ids', failedIds)
    }
  }

  function startRename(id: string, currentName: string) {
    setSectionRenameDraft(currentName)
    sectionRenameCancelledRef.current = false
    setRenamingSectionId(id)
    setSectionMenuOpenId(null)
  }

  // Blur commits unless Escape flagged a cancel.
  function commitRename(id: string, currentName: string) {
    if (sectionRenameCancelledRef.current) {
      sectionRenameCancelledRef.current = false
      setRenamingSectionId(null)
      return
    }
    const v = sectionRenameDraft.trim()
    if (v && v !== currentName) renameSection(id, v)
    setRenamingSectionId(null)
  }

  function cancelRename() {
    sectionRenameCancelledRef.current = true
  }

  return {
    newSectionName, setNewSectionName,
    newSectionDesc, setNewSectionDesc,
    showAddSetModal, setShowAddSetModal,
    renamingSectionId, sectionRenameDraft, setSectionRenameDraft,
    sectionMenuOpenId, setSectionMenuOpenId,
    editingSectionDescId, setEditingSectionDescId,
    sectionDescDraft, setSectionDescDraft,
    addSection, ensureUploadSection, saveSectionDescription, deleteSection, reorderSection,
    startRename, commitRename, cancelRename,
  }
}

export type SectionsApi = ReturnType<typeof useSections>
