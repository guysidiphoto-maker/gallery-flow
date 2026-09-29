import { useCallback, useEffect, useState } from 'react'
import {
  listPresets, savePreset, renamePreset, deletePreset, setDefaultPreset,
  capturePresetSettings, summarizePreset, type GalleryPreset,
} from '@/shared/gallery/galleryPresets'
import type { Confirm, EditorTab, Gallery, Toast } from '../types'

// Owner-scoped reusable settings bundles; loaded once, when Settings first opens.
export function usePresets(deps: {
  businessId: string | null
  editingGallery: Gallery | null
  editTab: EditorTab
  updateGallerySettings: (patch: Record<string, unknown>) => Promise<boolean>
  confirm: Confirm
  showToast: Toast
}) {
  const { businessId, editingGallery, editTab, updateGallerySettings, confirm, showToast } = deps
  const [presets, setPresets] = useState<GalleryPreset[]>([])
  const [presetsLoaded, setPresetsLoaded] = useState(false)
  const [presetBusy, setPresetBusy] = useState(false)

  const refreshPresets = useCallback(async () => {
    if (!businessId) return
    setPresets(await listPresets(businessId))
    setPresetsLoaded(true)
  }, [businessId])

  useEffect(() => {
    if (editTab === 'settings' && businessId && !presetsLoaded) void refreshPresets()
  }, [editTab, businessId, presetsLoaded, refreshPresets])

  // Identity/secrets are stripped client-side here and again by a server trigger.
  async function handleSavePreset() {
    if (!businessId || !editingGallery) return
    const name = window.prompt('שם הפריסט')?.trim()
    if (!name) return
    setPresetBusy(true)
    const created = await savePreset(businessId, name, editingGallery.delivery_settings as Record<string, unknown>)
    setPresetBusy(false)
    if (created) { await refreshPresets(); showToast({ kind: 'success', text: 'הפריסט נשמר' }) }
    else showToast({ kind: 'error', text: 'שמירת הפריסט נכשלה' })
  }

  async function handleApplyPreset(p: GalleryPreset) {
    if (!editingGallery) return
    const summary = summarizePreset(p)
    const ok = await confirm({
      title: `להחיל את "${p.name}"?`,
      body: summary.length ? summary.join(' · ') : 'ללא הגדרות',
      confirmLabel: 'החל',
    })
    if (!ok) return
    setPresetBusy(true)
    const applied = await updateGallerySettings(capturePresetSettings(p.settings))
    setPresetBusy(false)
    showToast(applied
      ? { kind: 'success', text: 'הפריסט הוחל' }
      : { kind: 'error', text: 'החלת הפריסט נכשלה' })
  }

  async function handleRenamePreset(p: GalleryPreset) {
    const name = window.prompt('שם חדש לפריסט', p.name)?.trim()
    if (!name || name === p.name) return
    setPresetBusy(true)
    const ok = await renamePreset(p.id, name)
    setPresetBusy(false)
    if (ok) { await refreshPresets(); showToast({ kind: 'success', text: 'שם הפריסט עודכן' }) }
  }

  async function handleDeletePreset(p: GalleryPreset) {
    const ok = await confirm({ title: `למחוק את "${p.name}"?`, body: 'פעולה זו אינה הפיכה.', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    setPresetBusy(true)
    const done = await deletePreset(p.id)
    setPresetBusy(false)
    if (done) { await refreshPresets(); showToast({ kind: 'success', text: 'הפריסט נמחק' }) }
  }

  async function handleSetDefaultPreset(p: GalleryPreset) {
    setPresetBusy(true)
    const ok = await setDefaultPreset(p.id)
    setPresetBusy(false)
    if (ok) { await refreshPresets(); showToast({ kind: 'success', text: 'הוגדר כברירת מחדל' }) }
  }

  return {
    presets, presetsLoaded, presetBusy,
    handleSavePreset, handleApplyPreset, handleRenamePreset, handleDeletePreset, handleSetDefaultPreset,
  }
}

export type PresetsApi = ReturnType<typeof usePresets>
