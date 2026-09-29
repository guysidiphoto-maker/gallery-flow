import { useRef } from 'react'
import type React from 'react'
import { supabase } from '@/shared/lib/supabase'
import { validateDeliverySettingsPatch, summarizeValidationErrors } from '@/shared/gallery/deliverySettingsSchema'
import { saveDeliverySettings, TEXT_INPUT_KEYS, TEXT_WRITE_DEBOUNCE_MS } from '../lib/deliverySettings'
import type { Gallery, Toast } from '../types'

type SetGallery = React.Dispatch<React.SetStateAction<Gallery | null>>
type SetGalleries = React.Dispatch<React.SetStateAction<Gallery[]>>

// delivery_settings writers for the open gallery. All are optimistic: the
// patch is applied locally first and rolled back if the RPC rejects it.
export function useGallerySettings(deps: {
  editingGallery: Gallery | null
  setEditingGallery: SetGallery
  setGalleries: SetGalleries
  markDirty: () => void
  showToast: Toast
}) {
  const { editingGallery, setEditingGallery, setGalleries, markDirty, showToast } = deps
  // Per-key debounce timers for text inputs (see TEXT_INPUT_KEYS).
  const settingWriteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Shared optimistic write + rollback. `syncList` also mirrors the change onto
  // the dashboard card behind the editor; `debounceKey` coalesces keystrokes.
  async function writeSettings(
    patch: Record<string, unknown>,
    opts: { syncList: boolean; debounceKey?: string },
  ): Promise<boolean> {
    if (!editingGallery) return false
    const gid = editingGallery.id
    const prevSettings = editingGallery.delivery_settings || {}
    const nextSettings = { ...prevSettings, ...patch }
    setEditingGallery({ ...editingGallery, delivery_settings: nextSettings })
    if (opts.syncList) {
      setGalleries(prev => prev.map(g =>
        g.id === gid ? { ...g, delivery_settings: nextSettings } : g))
    }
    markDirty()

    const flushWrite = async () => {
      const { ok, errors } = await saveDeliverySettings(gid, patch)
      if (!ok) {
        setEditingGallery(g => g && g.id === gid
          ? { ...g, delivery_settings: prevSettings } : g)
        if (opts.syncList) {
          setGalleries(prev => prev.map(g =>
            g.id === gid ? { ...g, delivery_settings: prevSettings } : g))
        }
        showToast({ kind: 'error', text: 'שמירת ההגדרה נכשלה. נסה שוב.' })
        console.warn('[updateGallerySettings]', patch, errors)
      }
      return ok
    }

    const key = opts.debounceKey
    if (key) {
      const existing = settingWriteTimersRef.current.get(key)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        settingWriteTimersRef.current.delete(key)
        void flushWrite()
      }, TEXT_WRITE_DEBOUNCE_MS)
      settingWriteTimersRef.current.set(key, timer)
      return true
    }
    return flushWrite()
  }

  // Single key from a settings control. Pre-validated against the shared
  // schema for an immediate, specific message (the RPC re-validates).
  async function updateGallerySetting(key: string, value: unknown) {
    if (!editingGallery) return
    const validation = validateDeliverySettingsPatch({ [key]: value })
    if (!validation.ok) {
      showToast({ kind: 'error', text: summarizeValidationErrors(validation.errors) })
      console.warn('[updateGallerySetting] validation failed', validation.errors)
      return
    }
    await writeSettings({ [key]: value }, {
      syncList: false,
      debounceKey: TEXT_INPUT_KEYS.has(key) ? key : undefined,
    })
  }

  // Several keys written as one logical action (e.g. cover path + legacy URL):
  // one round-trip, one optimistic update, one rollback. Resolves to ok.
  function updateGallerySettings(patch: Record<string, unknown>): Promise<boolean> {
    return writeSettings(patch, { syncList: true })
  }

  // The name lives in two places: galleries.name (dashboard + header) and
  // delivery_settings.galleryTitle (public viewer). Write both.
  async function renameGalleryTitle(newTitle: string) {
    if (!editingGallery) return
    const prevSettings = editingGallery.delivery_settings || {}
    const prevName = editingGallery.name
    const nextSettings = { ...prevSettings, galleryTitle: newTitle }
    setEditingGallery({ ...editingGallery, name: newTitle, delivery_settings: nextSettings })
    setGalleries(gs => gs.map(g => g.id === editingGallery.id ? { ...g, name: newTitle } : g))
    markDirty()
    // `name` is a granted column; galleryTitle must go through the RPC.
    const { error: nameErr } = await supabase
      .from('galleries')
      .update({ name: newTitle })
      .eq('id', editingGallery.id)
    const titleRes = await saveDeliverySettings(editingGallery.id, { galleryTitle: newTitle })
    if (nameErr || !titleRes.ok) {
      setEditingGallery(g => g && g.id === editingGallery.id
        ? { ...g, name: prevName, delivery_settings: prevSettings } : g)
      setGalleries(gs => gs.map(g => g.id === editingGallery.id ? { ...g, name: prevName } : g))
      showToast({ kind: 'error', text: 'שמירת הכותרת נכשלה. נסה שוב.' })
      console.warn('[renameGalleryTitle]', nameErr, titleRes.errors)
    }
  }

  // Face recognition is stored twice: the column (read by the rekognition RPC)
  // and the JSONB key (read by the viewer). Written together, rolled back together.
  async function toggleFaceIndex() {
    if (!editingGallery) return
    const ds = (editingGallery.delivery_settings ?? {}) as Record<string, unknown>
    const newVal = !ds.faceIndexEnabled
    const prevSettings = editingGallery.delivery_settings || {}
    const nextSettings = { ...prevSettings, faceIndexEnabled: newVal }
    setEditingGallery({
      ...editingGallery,
      face_index_enabled: newVal,
      delivery_settings: nextSettings,
    })
    markDirty()
    const { error: colErr } = await supabase
      .from('galleries')
      .update({ face_index_enabled: newVal })
      .eq('id', editingGallery.id)
    const dsRes = await saveDeliverySettings(editingGallery.id, { faceIndexEnabled: newVal })
    if (colErr || !dsRes.ok) {
      setEditingGallery(g => g && g.id === editingGallery.id
        ? { ...g, face_index_enabled: !newVal, delivery_settings: prevSettings } : g)
      showToast({ kind: 'error', text: 'שמירת זיהוי פנים נכשלה.' })
      console.warn('[face-index toggle]', colErr, dsRes.errors)
    }
  }

  return { updateGallerySetting, updateGallerySettings, renameGalleryTitle, toggleFaceIndex }
}

export type GallerySettingsApi = ReturnType<typeof useGallerySettings>
