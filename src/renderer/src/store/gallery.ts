import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { nanoid } from '../utils/nanoid'
import type { ImageFile, RenameHistoryEntry, DuplicateGroup, SortMode, StorySceneDef, StoryOptions, StoryBuildResult } from '../types'
import { generateInsertAfterName, generateSequentialNames, validateRename } from '../utils/naming'
import { loadExifTime, loadExifCamera } from '../utils/imageUtils'
import { join } from '../utils/path'

// Window API (exposed via preload)
declare global {
  interface Window {
    api: {
      openFolderDialog: () => Promise<string | null>
      scanFolder: (p: string) => Promise<Array<{
        filename: string; path: string; folderPath: string
        ext: string; size: number; mtimeMs: number; birthtimeMs: number
      }>>
      renameFile: (o: string, n: string) => Promise<{ success: boolean; error?: string }>
      batchRename: (ops: Array<{ oldPath: string; newPath: string }>) => Promise<{ success: boolean; error?: string }>
      deleteFile: (p: string) => Promise<{ success: boolean; error?: string }>
      revealInFinder: (p: string) => Promise<void>
      readFileBuffer: (p: string) => Promise<ArrayBuffer | null>
      getPref: (k: string) => Promise<unknown>
      setPref: (k: string, v: unknown) => Promise<void>
      buildStoryScenes: (imagePaths: string[], totalDuration: number, motionMode?: string) => Promise<StoryBuildResult & { error?: string }>
      renderStory: (scenes: StorySceneDef[], options: StoryOptions, outputPath: string) => Promise<{ success: boolean; error?: string }>
      chooseExportPath: (defaultName: string) => Promise<string | null>
      onStoryProgress: (cb: (data: { percent: number; stage: string }) => void) => () => void
      chooseSocialExportDir: () => Promise<string | null>
      exportSocialPackage: (scenes: unknown[], outputDir: string, options: { includeOrderOverlay: boolean }) => Promise<{ success: boolean; error?: string }>
      onSocialExportProgress: (cb: (data: { percent: number; stage: string }) => void) => () => void
    }
  }
}

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  undoId?: string  // if set, clicking Undo reverses this rename history entry
}

export interface GalleryState {
  // Core data
  images: ImageFile[]
  folderPath: string | null
  isLoading: boolean
  loadError: string | null

  // Selection
  selectedIds: Set<string>

  // UI State
  thumbnailSize: number
  showPreviewMode: boolean
  showDuplicatesPanel: boolean
  showRenamePreview: boolean
  renamePreviewMode: 'order' | 'randomize'
  pendingBatchRename: Array<{ oldPath: string; newFilename: string }> | null
  pendingImageOrder: ImageFile[] | null  // set by randomizeOrder to reorder images after rename
  duplicateGroups: DuplicateGroup[]
  isDuplicateScanning: boolean
  duplicateScanProgress: number  // 0–100

  // Prefix for smart rename
  filenamePrefix: string

  // Undo history
  renameHistory: RenameHistoryEntry[]

  // Toasts
  toasts: Toast[]

  // Top Picks
  topPickIds: Set<string>

  // Image Viewer
  viewerImageId: string | null

  // Story Video
  showStoryModal: boolean

  // Actions
  openFolder: () => Promise<void>
  reloadFolder: () => Promise<void>
  handleDrop: (activeId: string, overId: string) => Promise<void>
  moveToTop: (imageId: string) => Promise<void>
  moveToBottom: (imageId: string) => Promise<void>
  sortBy: (mode: SortMode) => void
  loadExifData: () => Promise<void>
  selectImage: (id: string, multi: boolean) => void
  selectRange: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  setThumbnailSize: (size: number) => void
  togglePreviewMode: () => void
  toggleDuplicatesPanel: () => void
  scanDuplicates: () => Promise<void>
  deleteSelected: () => Promise<void>
  deleteImage: (id: string) => Promise<void>
  revealInFinder: (id: string) => Promise<void>
  prepareApplyOrder: (prefix?: string) => void
  confirmApplyOrder: () => Promise<void>
  cancelApplyOrder: () => void
  randomizeOrder: () => void
  undoRename: (entryId: string) => Promise<void>
  undoLastRename: () => Promise<void>
  setFilenamePrefix: (prefix: string) => void
  addToast: (msg: string, type?: Toast['type'], undoId?: string) => void
  dismissToast: (id: string) => void

  // Top Picks
  toggleTopPick: (id: string) => void
  toggleTopPickSelected: () => void
  removeTopPickSelected: () => void
  clearTopPicks: () => void

  // Image Viewer
  openViewer: (id: string) => void
  closeViewer: () => void
  viewerNavigate: (dir: 'next' | 'prev') => void

  // Story Video
  openStoryModal: () => void
  closeStoryModal: () => void

  // Randomize modal
  showRandomizeModal: boolean
  openRandomizeModal: () => void
  closeRandomizeModal: () => void
  executeRandomize: (shuffled: ImageFile[], mode: 'all' | 'picks-only') => Promise<void>
}

export const useGallery = create<GalleryState>((set, get) => ({
  images: [],
  folderPath: null,
  isLoading: false,
  loadError: null,
  selectedIds: new Set(),
  anchorId: null as string | null,
  thumbnailSize: 220,
  showPreviewMode: false,
  showDuplicatesPanel: false,
  showRenamePreview: false,
  renamePreviewMode: 'order' as const,
  pendingBatchRename: null,
  pendingImageOrder: null,
  duplicateGroups: [],
  isDuplicateScanning: false,
  duplicateScanProgress: 0,
  filenamePrefix: '',
  renameHistory: [],
  toasts: [],
  topPickIds: new Set(),
  viewerImageId: null,
  showStoryModal: false,
  showRandomizeModal: false,

  // ── Folder Loading ──────────────────────────────────────────────────────

  openFolder: async () => {
    const path = await window.api.openFolderDialog()
    if (!path) return
    await window.api.setPref('lastFolder', path)
    // Reset all session state when opening a new folder
    set({ folderPath: path, selectedIds: new Set(), duplicateGroups: [], topPickIds: new Set(), viewerImageId: null })
    await get().reloadFolder()
  },

  reloadFolder: async () => {
    const { folderPath } = get()
    if (!folderPath) return
    set({ isLoading: true, loadError: null })
    try {
      const raw = await window.api.scanFolder(folderPath)
      // Sort by filename by default
      raw.sort((a, b) => a.filename.localeCompare(b.filename))
      const images: ImageFile[] = raw.map(r => ({
        id: r.path,  // stable ID = original path
        ...r
      }))
      // Reset session state on reload — top picks are session-only and must clear
      set({ images, isLoading: false, topPickIds: new Set(), selectedIds: new Set() })
    } catch (err) {
      set({ isLoading: false, loadError: String(err) })
    }
  },

  // ── Drag & Drop Reorder ─────────────────────────────────────────────────

  handleDrop: async (activeId, overId) => {
    const { images } = get()
    if (activeId === overId) return

    const oldIdx = images.findIndex(img => img.id === activeId)
    const newIdx = images.findIndex(img => img.id === overId)
    if (oldIdx === -1 || newIdx === -1) return

    const newOrder = arrayMove(images, oldIdx, newIdx)
    const movedImage = newOrder[newIdx]

    // Determine the previous image in new order (null if moved to index 0)
    const prevImage = newIdx > 0 ? newOrder[newIdx - 1] : null

    // Build existing names set (exclude the moved file's old name)
    const existingNames = new Set(
      newOrder
        .filter(img => img.id !== movedImage.id)
        .map(img => img.filename.toLowerCase())
    )

    let newFilename: string
    try {
      newFilename = generateInsertAfterName(
        prevImage?.filename ?? null,
        movedImage.ext,
        existingNames
      )
    } catch (err) {
      get().addToast(`Could not rename: ${err}`, 'error')
      return
    }

    const validation = validateRename(movedImage.filename, newFilename, existingNames)
    if (!validation.valid) {
      get().addToast(validation.error ?? 'Rename conflict', 'error')
      return
    }

    const oldPath = movedImage.path
    const newPath = join(movedImage.folderPath, newFilename)
    const isNoOp = movedImage.filename.toLowerCase() === newFilename.toLowerCase()

    if (!isNoOp) {
      // Apply rename to filesystem
      const result = await window.api.renameFile(oldPath, newPath)
      if (!result.success) {
        get().addToast(`Rename failed: ${result.error}`, 'error')
        return
      }
    }

    // Update state: apply new order (and filename if it changed)
    const updatedImages = newOrder.map(img =>
      img.id === movedImage.id
        ? { ...img, filename: newFilename, path: newPath }
        : img
    )

    if (isNoOp) {
      // Just reorder, no rename needed
      set({ images: updatedImages })
      return
    }

    // Record history for undo
    const historyEntry: RenameHistoryEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      description: `Moved "${movedImage.filename}" → "${newFilename}"`,
      operations: [{
        imageId: movedImage.id,
        oldPath,
        oldFilename: movedImage.filename,
        newPath,
        newFilename
      }]
    }

    set(state => ({
      images: updatedImages,
      renameHistory: [historyEntry, ...state.renameHistory].slice(0, 50)
    }))

    get().addToast(
      `Renamed to ${newFilename}`,
      'success',
      historyEntry.id
    )
  },

  // ── Move to Top / Bottom ────────────────────────────────────────────────

  moveToTop: async (imageId) => {
    const { images } = get()
    const idx = images.findIndex(img => img.id === imageId)
    if (idx <= 0) return
    await get().handleDrop(imageId, images[0].id)
  },

  moveToBottom: async (imageId) => {
    const { images } = get()
    const idx = images.findIndex(img => img.id === imageId)
    if (idx === images.length - 1) return
    await get().handleDrop(imageId, images[images.length - 1].id)
  },

  // ── Sorting ─────────────────────────────────────────────────────────────

  sortBy: (mode) => {
    const { images } = get()
    const sorted = [...images]

    switch (mode) {
      case 'filename':
        sorted.sort((a, b) => a.filename.localeCompare(b.filename))
        break
      case 'date-asc':
        sorted.sort((a, b) => {
          const ta = a.captureTime ?? a.birthtimeMs
          const tb = b.captureTime ?? b.birthtimeMs
          return ta - tb
        })
        break
      case 'date-desc':
        sorted.sort((a, b) => {
          const ta = a.captureTime ?? a.birthtimeMs
          const tb = b.captureTime ?? b.birthtimeMs
          return tb - ta
        })
        break
      case 'shuffle':
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
        }
        break
    }

    set({ images: sorted })
    if (mode !== 'shuffle') {
      get().addToast(`Sorted by ${mode === 'filename' ? 'filename' : mode.replace('-', ' ')}`, 'info')
    }
  },

  // ── EXIF loading ────────────────────────────────────────────────────────

  loadExifData: async () => {
    const { images } = get()
    const updated = [...images]
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].captureTime !== undefined) continue  // already loaded
      const [time, camera] = await Promise.all([
        loadExifTime(updated[i]),
        loadExifCamera(updated[i])
      ])
      updated[i] = { ...updated[i], captureTime: time, cameraModel: camera }
      // Yield every 10 images to keep UI responsive
      if (i % 10 === 0) {
        set({ images: [...updated] })
        await new Promise(r => setTimeout(r, 0))
      }
    }
    set({ images: updated })
  },

  // ── Selection ───────────────────────────────────────────────────────────

  selectImage: (id, multi) => {
    set(state => {
      const next = new Set(state.selectedIds)
      if (multi) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        if (next.size === 1 && next.has(id)) next.clear()
        else { next.clear(); next.add(id) }
      }
      return { selectedIds: next, anchorId: id }
    })
  },

  selectRange: (id) => {
    set(state => {
      const anchor = state.anchorId ?? id
      const anchorIdx = state.images.findIndex(img => img.id === anchor)
      const targetIdx = state.images.findIndex(img => img.id === id)
      if (anchorIdx === -1 || targetIdx === -1) return { selectedIds: new Set([id]) }
      const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
      return { selectedIds: new Set(state.images.slice(from, to + 1).map(img => img.id)) }
      // anchorId stays unchanged — it's the fixed end of the range
    })
  },

  selectAll: () => set(state => ({ selectedIds: new Set(state.images.map(img => img.id)) })),
  deselectAll: () => set({ selectedIds: new Set(), anchorId: null }),

  // ── UI ──────────────────────────────────────────────────────────────────

  setThumbnailSize: (size) => {
    set({ thumbnailSize: size })
    window.api.setPref('thumbnailSize', size)
  },

  togglePreviewMode: () => set(state => ({ showPreviewMode: !state.showPreviewMode })),
  toggleDuplicatesPanel: () => set(state => ({ showDuplicatesPanel: !state.showDuplicatesPanel })),

  // ── Duplicate Detection ─────────────────────────────────────────────────

  scanDuplicates: async () => {
    const { images } = get()
    set({ isDuplicateScanning: true, duplicateScanProgress: 0, showDuplicatesPanel: true })

    const { detectDuplicates } = await import('../utils/imageUtils')
    const groups = await detectDuplicates(images, (done, total) => {
      set({ duplicateScanProgress: Math.round((done / total) * 100) })
    })

    set({ duplicateGroups: groups, isDuplicateScanning: false, duplicateScanProgress: 100 })

    if (groups.length === 0) {
      get().addToast('No duplicates found', 'info')
    } else {
      get().addToast(`Found ${groups.length} duplicate group(s)`, 'info')
    }
  },

  // ── Delete ──────────────────────────────────────────────────────────────

  deleteSelected: async () => {
    const { images, selectedIds } = get()
    const toDelete = images.filter(img => selectedIds.has(img.id))
    for (const img of toDelete) {
      await window.api.deleteFile(img.path)
    }
    set(state => {
      const nextTopPicks = new Set(state.topPickIds)
      for (const id of selectedIds) nextTopPicks.delete(id)
      return {
        images: state.images.filter(img => !selectedIds.has(img.id)),
        selectedIds: new Set(),
        topPickIds: nextTopPicks
      }
    })
    get().addToast(`Moved ${toDelete.length} image(s) to Trash`, 'info')
  },

  deleteImage: async (id) => {
    const img = get().images.find(i => i.id === id)
    if (!img) return
    const result = await window.api.deleteFile(img.path)
    if (!result.success) {
      get().addToast(`Delete failed: ${result.error}`, 'error')
      return
    }
    set(state => {
      const nextTopPicks = new Set(state.topPickIds)
      nextTopPicks.delete(id)
      return {
        images: state.images.filter(i => i.id !== id),
        selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
        topPickIds: nextTopPicks
      }
    })
  },

  revealInFinder: async (id) => {
    const img = get().images.find(i => i.id === id)
    if (img) await window.api.revealInFinder(img.path)
  },

  // ── Apply Order to Filenames ────────────────────────────────────────────

  prepareApplyOrder: (prefix = '') => {
    const { images } = get()
    const ops = generateSequentialNames(images, prefix)
    set({ pendingBatchRename: ops, pendingImageOrder: null, showRenamePreview: true, renamePreviewMode: 'order', filenamePrefix: prefix })
  },

  confirmApplyOrder: async () => {
    const { pendingBatchRename, pendingImageOrder, renamePreviewMode, images } = get()
    if (!pendingBatchRename) return

    const ops = pendingBatchRename.map(op => {
      const img = images.find(i => i.path === op.oldPath)!
      const newPath = join(img.folderPath, op.newFilename)
      return { oldPath: op.oldPath, newPath }
    })

    const result = await window.api.batchRename(ops)
    if (!result.success) {
      get().addToast(`Batch rename failed: ${result.error}`, 'error')
      set({ showRenamePreview: false, pendingBatchRename: null, pendingImageOrder: null })
      return
    }

    // Record history
    const historyOps = pendingBatchRename.map(op => {
      const img = images.find(i => i.path === op.oldPath)!
      return {
        imageId: img.id,
        oldPath: op.oldPath,
        oldFilename: img.filename,
        newPath: join(img.folderPath, op.newFilename),
        newFilename: op.newFilename
      }
    })

    const historyEntry: RenameHistoryEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      description: renamePreviewMode === 'randomize'
        ? `Randomized order (${pendingBatchRename.length} files)`
        : `Applied sequential order (${pendingBatchRename.length} files)`,
      operations: historyOps
    }

    // Build updated images: use pendingImageOrder for ordering (randomize), or original order
    const opMap = new Map(historyOps.map(op => [op.imageId, op]))
    const baseOrder = pendingImageOrder ?? images
    const updatedImages = baseOrder.map(img => {
      const op = opMap.get(img.id)
      if (!op) return img
      return { ...img, filename: op.newFilename, path: op.newPath }
    })

    set(state => ({
      images: updatedImages,
      showRenamePreview: false,
      pendingBatchRename: null,
      pendingImageOrder: null,
      renamePreviewMode: 'order',
      renameHistory: [historyEntry, ...state.renameHistory].slice(0, 50)
    }))

    get().addToast(`Renamed ${pendingBatchRename.length} files`, 'success', historyEntry.id)
  },

  cancelApplyOrder: () => set({ showRenamePreview: false, pendingBatchRename: null, pendingImageOrder: null }),

  randomizeOrder: () => {
    get().openRandomizeModal()
  },

  openRandomizeModal: () => set({ showRandomizeModal: true }),
  closeRandomizeModal: () => set({ showRandomizeModal: false }),

  executeRandomize: async (shuffled, mode) => {
    const { images, filenamePrefix } = get()
    const ops = generateSequentialNames(shuffled, filenamePrefix)

    const renameOps = ops.map(op => {
      const img = images.find(i => i.path === op.oldPath)!
      return { oldPath: op.oldPath, newPath: join(img.folderPath, op.newFilename) }
    })

    const result = await window.api.batchRename(renameOps)
    if (!result.success) {
      get().addToast(`Shuffle failed: ${result.error}`, 'error')
      set({ showRandomizeModal: false })
      return
    }

    const historyOps = ops.map(op => {
      const img = images.find(i => i.path === op.oldPath)!
      return {
        imageId: img.id,
        oldPath: op.oldPath,
        oldFilename: img.filename,
        newPath: join(img.folderPath, op.newFilename),
        newFilename: op.newFilename
      }
    })

    const desc = mode === 'all'
      ? `Shuffled all (${ops.length} files)`
      : `Shuffled non-picks (${ops.length} files)`

    const historyEntry: RenameHistoryEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      description: desc,
      operations: historyOps
    }

    const opMap = new Map(historyOps.map(op => [op.imageId, op]))
    const updatedImages = shuffled.map(img => {
      const op = opMap.get(img.id)
      if (!op) return img
      return { ...img, filename: op.newFilename, path: op.newPath }
    })

    set(state => ({
      images: updatedImages,
      showRandomizeModal: false,
      renameHistory: [historyEntry, ...state.renameHistory].slice(0, 50)
    }))

    get().addToast(desc, 'success', historyEntry.id)
  },

  // ── Undo ────────────────────────────────────────────────────────────────

  undoRename: async (entryId) => {
    const { renameHistory, images } = get()
    const entry = renameHistory.find(e => e.id === entryId)
    if (!entry) return

    // Reverse all operations in this entry
    const reverseOps = [...entry.operations].reverse()
    const batchOps = reverseOps.map(op => ({ oldPath: op.newPath, newPath: op.oldPath }))

    const result = await window.api.batchRename(batchOps)
    if (!result.success) {
      get().addToast(`Undo failed: ${result.error}`, 'error')
      return
    }

    // Update image state
    const opMap = new Map(reverseOps.map(op => [op.imageId, op]))
    const updatedImages = images.map(img => {
      const op = opMap.get(img.id)
      if (!op) return img
      return { ...img, filename: op.oldFilename, path: op.oldPath }
    })

    set(state => ({
      images: updatedImages,
      renameHistory: state.renameHistory.filter(e => e.id !== entryId)
    }))

    get().addToast(`Undo: restored ${reverseOps.length} file(s)`, 'success')
  },

  undoLastRename: async () => {
    const { renameHistory } = get()
    if (renameHistory.length === 0) return
    await get().undoRename(renameHistory[0].id)
  },

  setFilenamePrefix: (prefix) => set({ filenamePrefix: prefix }),

  // ── Toasts ──────────────────────────────────────────────────────────────

  addToast: (message, type = 'info', undoId) => {
    const toast: Toast = { id: nanoid(), message, type, undoId }
    set(state => ({ toasts: [toast, ...state.toasts].slice(0, 5) }))
    // Auto-dismiss after 4s (unless it has an undo option — those stay 8s)
    const delay = undoId ? 8000 : 4000
    setTimeout(() => get().dismissToast(toast.id), delay)
  },

  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  // ── Top Picks ────────────────────────────────────────────────────────────

  toggleTopPick: (id) => {
    const { topPickIds } = get()
    const isNewPick = !topPickIds.has(id)
    set(state => {
      const next = new Set(state.topPickIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { topPickIds: next }
    })
    // Move to top of gallery on first pick
    if (isNewPick) {
      get().moveToTop(id)
    }
  },

  toggleTopPickSelected: async () => {
    const { selectedIds, topPickIds, images } = get()
    if (selectedIds.size === 0) return

    const newPickIds = [...selectedIds].filter(id => !topPickIds.has(id))

    if (newPickIds.length === 0) {
      // All are already picks — un-pick them (use Shift+T for explicit remove)
      const next = new Set(topPickIds)
      for (const id of selectedIds) next.delete(id)
      set({ topPickIds: next })
      return
    }

    // Mark all selected as picks
    const next = new Set(topPickIds)
    for (const id of selectedIds) next.add(id)

    if (selectedIds.size === 1) {
      // Single image: rename-based move to top
      const [id] = selectedIds
      set({ topPickIds: next })
      await get().moveToTop(id)
      return
    }

    // Multi-select: float all picks to top of images array in gallery order (no rename)
    const picksInOrder = images.filter(img => next.has(img.id))
    const nonPicks = images.filter(img => !next.has(img.id))
    set({ topPickIds: next, images: [...picksInOrder, ...nonPicks] })
    get().addToast(
      `${newPickIds.length} image${newPickIds.length !== 1 ? 's' : ''} added to top picks — press ⌘Enter to apply order`,
      'success'
    )
  },

  removeTopPickSelected: () => {
    const { selectedIds, topPickIds } = get()
    if (selectedIds.size === 0) return
    const next = new Set(topPickIds)
    let removed = 0
    for (const id of selectedIds) {
      if (next.has(id)) { next.delete(id); removed++ }
    }
    if (removed === 0) return
    set({ topPickIds: next })
    get().addToast(
      `${removed} image${removed !== 1 ? 's' : ''} removed from top picks`,
      'info'
    )
  },

  clearTopPicks: () => set({ topPickIds: new Set() }),

  // ── Image Viewer ─────────────────────────────────────────────────────────

  openViewer: (id) => set({ viewerImageId: id }),
  closeViewer: () => set({ viewerImageId: null }),
  viewerNavigate: (dir) => {
    const { viewerImageId, images } = get()
    if (!viewerImageId) return
    const idx = images.findIndex(img => img.id === viewerImageId)
    if (idx === -1) return
    const nextIdx = dir === 'next' ? Math.min(idx + 1, images.length - 1) : Math.max(0, idx - 1)
    set({ viewerImageId: images[nextIdx].id })
  },

  // ── Story Video ──────────────────────────────────────────────────────────

  openStoryModal: () => set({ showStoryModal: true }),
  closeStoryModal: () => set({ showStoryModal: false })
}))
