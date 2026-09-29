import { useRef } from 'react'
import type React from 'react'
import { updateGallery } from '@/shared/data/galleries'
import { validateDeliverySettingsPatch, summarizeValidationErrors } from '@/shared/gallery/deliverySettingsSchema'
import { rollbackSettingsPatch } from '../lib/settingsRollback'
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
  const debounceBaseRef = useRef<Map<string, Record<string, unknown>>>(new Map())

  // Shared optimistic write + rollback. `syncList` also mirrors the change onto
  // the dashboard card behind the editor; `debounceKey` coalesces keystrokes.
  // Both the apply and the rollback are functional and key-wise so a concurrent
  // write to another key is never overwritten by this one's snapshot.
  async function writeSettings(
    patch: Record<string, unknown>,
    opts: { syncList: boolean; debounceKey?: string },
  ): Promise<boolean> {
    if (!editingGallery) return false
    const gid = editingGallery.id
    // A debounced key rolls back to its value before the first coalesced keystroke.
    const pendingBase = opts.debounceKey ? debounceBaseRef.current.get(opts.debounceKey) : undefined
    const prevSettings = pendingBase ?? editingGallery.delivery_settings ?? {}
    if (opts.debounceKey && !pendingBase) debounceBaseRef.current.set(opts.debounceKey, prevSettings)
    const apply = (settings: Record<string, unknown> | null | undefined) => ({ ...(settings ?? {}), ...patch })
    const undo = (settings: Record<string, unknown> | null | undefined) =>
      rollbackSettingsPatch(settings ?? {}, prevSettings, patch)
    setEditingGallery(g => g && g.id === gid ? { ...g, delivery_settings: apply(g.delivery_settings) } : g)
    if (opts.syncList) {
      setGalleries(prev => prev.map(g =>
        g.id === gid ? { ...g, delivery_settings: apply(g.delivery_settings) } : g))
    }
    markDirty()

    const flushWrite = async () => {
      const { ok, errors } = await saveDeliverySettings(gid, patch)
      if (!ok) {
        setEditingGallery(g => g && g.id === gid
          ? { ...g, delivery_settings: undo(g.delivery_settings) } : g)
        if (opts.syncList) {
          setGalleries(prev => prev.map(g =>
            g.id === gid ? { ...g, delivery_settings: undo(g.delivery_settings) } : g))
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
        debounceBaseRef.current.delete(key)
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
    const gid = editingGallery.id
    const prevSettings = editingGallery.delivery_settings || {}
    const prevName = editingGallery.name
    const patch = { galleryTitle: newTitle }
    setEditingGallery(g => g && g.id === gid
      ? { ...g, name: newTitle, delivery_settings: { ...(g.delivery_settings ?? {}), ...patch } } : g)
    setGalleries(gs => gs.map(g => g.id === gid ? { ...g, name: newTitle } : g))
    markDirty()
    // `name` is a granted column; galleryTitle must go through the RPC.
    const { error: nameErr } = await updateGallery(gid, { name: newTitle })
    const titleRes = await saveDeliverySettings(gid, patch)
    if (nameErr || !titleRes.ok) {
      const undoName = (name: string) => name === newTitle ? prevName : name
      setEditingGallery(g => g && g.id === gid
        ? { ...g, name: undoName(g.name), delivery_settings: rollbackSettingsPatch(g.delivery_settings ?? {}, prevSettings, patch) } : g)
      setGalleries(gs => gs.map(g => g.id === gid ? { ...g, name: undoName(g.name) } : g))
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
    const gid = editingGallery.id
    const prevSettings = editingGallery.delivery_settings || {}
    const patch = { faceIndexEnabled: newVal }
    setEditingGallery(g => g && g.id === gid
      ? { ...g, face_index_enabled: newVal, delivery_settings: { ...(g.delivery_settings ?? {}), ...patch } } : g)
    markDirty()
    const { error: colErr } = await updateGallery(gid, { face_index_enabled: newVal })
    const dsRes = await saveDeliverySettings(gid, patch)
    if (colErr || !dsRes.ok) {
      setEditingGallery(g => g && g.id === gid
        ? {
            ...g,
            face_index_enabled: g.face_index_enabled === newVal ? !newVal : g.face_index_enabled,
            delivery_settings: rollbackSettingsPatch(g.delivery_settings ?? {}, prevSettings, patch),
          } : g)
      showToast({ kind: 'error', text: 'שמירת זיהוי פנים נכשלה.' })
      console.warn('[face-index toggle]', colErr, dsRes.errors)
    }
  }

  return { updateGallerySetting, updateGallerySettings, renameGalleryTitle, toggleFaceIndex }
}

export type GallerySettingsApi = ReturnType<typeof useGallerySettings>
