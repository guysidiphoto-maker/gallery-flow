import { useCallback, useEffect, useState } from 'react'
import { capturePresetSettings, summarizePreset, type GalleryPreset } from '@/shared/gallery/galleryPresets'
import {
  deleteGalleryPreset, insertGalleryPreset, listGalleryPresets, updateGalleryPreset,
} from '@/shared/data/presets'
import type { Confirm, EditorTab, Gallery, Toast } from '../types'

// True when the write succeeded; failures are logged under `[presets] <label> failed`.
function succeeded(label: string, error: unknown): boolean {
  if (error) console.warn(`[presets] ${label} failed`, error)
  return !error
}

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
    const { data, error } = await listGalleryPresets(businessId)
    setPresets(succeeded('list', error) ? (data ?? []) as GalleryPreset[] : [])
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
    const { error } = await insertGalleryPreset({
      business_id: businessId,
      name: name.trim(),
      settings: capturePresetSettings(editingGallery.delivery_settings),
    })
    setPresetBusy(false)
    if (succeeded('save', error)) { await refreshPresets(); showToast({ kind: 'success', text: 'הפריסט נשמר' }) }
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
    const { error } = await updateGalleryPreset(p.id, { name: name.trim() })
    setPresetBusy(false)
    if (succeeded('rename', error)) { await refreshPresets(); showToast({ kind: 'success', text: 'שם הפריסט עודכן' }) }
  }

  async function handleDeletePreset(p: GalleryPreset) {
    const ok = await confirm({ title: `למחוק את "${p.name}"?`, body: 'פעולה זו אינה הפיכה.', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    setPresetBusy(true)
    const { error } = await deleteGalleryPreset(p.id)
    setPresetBusy(false)
    if (succeeded('delete', error)) { await refreshPresets(); showToast({ kind: 'success', text: 'הפריסט נמחק' }) }
  }

  async function handleSetDefaultPreset(p: GalleryPreset) {
    setPresetBusy(true)
    const { error } = await updateGalleryPreset(p.id, { is_default: true })
    setPresetBusy(false)
    if (succeeded('set-default', error)) { await refreshPresets(); showToast({ kind: 'success', text: 'הוגדר כברירת מחדל' }) }
  }

  return {
    presets, presetsLoaded, presetBusy,
    handleSavePreset, handleApplyPreset, handleRenamePreset, handleDeletePreset, handleSetDefaultPreset,
  }
}

export type PresetsApi = ReturnType<typeof usePresets>
