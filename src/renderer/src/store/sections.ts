import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { nanoid } from '../utils/nanoid'
import type { ImageFile, Section, SectionNamingMode } from '../types'

// Pixieset-style default: every gallery has at least one section, and uploads
// land in it so a photo is never left unassigned. Renameable by the user.
const DEFAULT_SECTION_NAME = 'Highlights'

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeDestNames(
  imageIds: string[],
  imgMap: Map<string, ImageFile>,
  namingMode: SectionNamingMode,
  customPrefix: string
): Array<{ srcPath: string; destName: string }> {
  const valid = imageIds.map(id => imgMap.get(id)).filter((i): i is ImageFile => !!i)
  const pad = Math.max(2, String(valid.length).length)

  return valid.map((img, idx) => {
    let destName: string
    switch (namingMode) {
      case 'sequential':
        destName = String(idx + 1).padStart(pad, '0') + img.ext.toLowerCase()
        break
      case 'original':
        destName = img.filename
        break
      case 'custom-prefix': {
        const pfx = customPrefix.trim() || 'IMG_'
        destName = pfx + String(idx + 1).padStart(pad, '0') + img.ext.toLowerCase()
        break
      }
    }
    return { srcPath: img.path, destName }
  })
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SectionsState {
  sections: Section[]
  activeSectionFilter: string | null  // null = All Images
  isPanelOpen: boolean
  isPublishModalOpen: boolean
  isPublishing: boolean
  publishError: string | null
  publishDone: boolean
  publishOutputDir: string | null
  /** Bumped whenever sections or section membership changes — used by the
   *  publish flow to know there are pending changes since the last upload. */
  sectionsDirtyAt: number

  // CRUD
  addSection: (name: string) => void
  renameSection: (id: string, name: string) => void
  deleteSection: (id: string) => void
  reorderSections: (activeId: string, overId: string) => void

  // Image assignment — single-section model: assigning to A automatically
  // removes from any previous section. There is no copy-vs-move; sections
  // are a labeling layer on top of the gallery.
  assignImagesToSection: (imageIds: string[], sectionId: string) => void
  removeImageFromSection: (imageId: string, sectionId: string) => void
  reorderSectionImages: (sectionId: string, activeId: string, overId: string) => void

  // Pixieset model: assign any images not yet in a section to a section, so a
  // photo is never left "unassigned". Target priority: the section the user is
  // currently viewing → else a default "Highlights" section (found or created).
  // Never silently merges into an unrelated named set. Idempotent — only
  // touches genuinely-unassigned ids, so it's safe to call after every import.
  ensureImagesAssigned: (allImageIds: string[]) => void

  // Settings
  setSectionNamingMode: (sectionId: string, mode: SectionNamingMode, prefix?: string) => void

  // UI
  setActiveSectionFilter: (id: string | null) => void
  togglePanel: () => void
  openPublishModal: () => void
  closePublishModal: () => void

  // Publish (local export)
  publishSections: (images: ImageFile[]) => Promise<void>

  // Reset on folder change / new project
  resetForFolder: () => void

  // Manually mark sections clean (called by publishGallery after a successful sync)
  markSectionsClean: () => void
}

const markDirty = () => Date.now()

export const useSections = create<SectionsState>((set, get) => ({
  sections: [],
  activeSectionFilter: null,
  isPanelOpen: true,
  isPublishModalOpen: false,
  isPublishing: false,
  publishError: null,
  publishDone: false,
  publishOutputDir: null,
  sectionsDirtyAt: 0,

  addSection: (name) => {
    const section: Section = {
      id: nanoid(),
      name: name.trim() || 'New Section',
      imageIds: [],
      namingMode: 'sequential',
      customPrefix: ''
    }
    set(s => ({ sections: [...s.sections, section], sectionsDirtyAt: markDirty() }))
  },

  renameSection: (id, name) => set(s => ({
    sections: s.sections.map(sec =>
      sec.id === id ? { ...sec, name: name.trim() || sec.name } : sec
    ),
    sectionsDirtyAt: markDirty(),
  })),

  deleteSection: (id) => set(s => ({
    // Removing a section just removes the entity. Image membership lives on
    // the section's imageIds[] which is gone with it. The image still exists
    // in the gallery (All Images) — there is no "delete image" side-effect.
    sections: s.sections.filter(sec => sec.id !== id),
    activeSectionFilter: s.activeSectionFilter === id ? null : s.activeSectionFilter,
    sectionsDirtyAt: markDirty(),
  })),

  reorderSections: (activeId, overId) => set(s => {
    const from = s.sections.findIndex(x => x.id === activeId)
    const to = s.sections.findIndex(x => x.id === overId)
    if (from < 0 || to < 0 || from === to) return s
    return { sections: arrayMove(s.sections, from, to), sectionsDirtyAt: markDirty() }
  }),

  assignImagesToSection: (imageIds, sectionId) => set(s => {
    const idSet = new Set(imageIds)
    return {
      sections: s.sections.map(sec => {
        if (sec.id === sectionId) {
          const existing = new Set(sec.imageIds)
          const toAdd = imageIds.filter(id => !existing.has(id))
          return { ...sec, imageIds: [...sec.imageIds, ...toAdd] }
        }
        // Single-section model: an image lives in at most one section, so
        // assigning to A clears it from any other section.
        return { ...sec, imageIds: sec.imageIds.filter(id => !idSet.has(id)) }
      }),
      sectionsDirtyAt: markDirty(),
    }
  }),

  ensureImagesAssigned: (allImageIds) => {
    const state = get()
    const assigned = new Set(state.sections.flatMap(sec => sec.imageIds))
    const unassigned = allImageIds.filter(id => !assigned.has(id))
    if (unassigned.length === 0) return

    let targetId = state.activeSectionFilter
    if (!targetId || !state.sections.some(sec => sec.id === targetId)) {
      const existing = state.sections.find(sec => sec.name === DEFAULT_SECTION_NAME)
      if (existing) {
        targetId = existing.id
      } else {
        get().addSection(DEFAULT_SECTION_NAME)
        const secs = get().sections
        targetId = secs[secs.length - 1].id
      }
    }
    get().assignImagesToSection(unassigned, targetId)
  },

  removeImageFromSection: (imageId, sectionId) => set(s => ({
    sections: s.sections.map(sec =>
      sec.id === sectionId
        ? { ...sec, imageIds: sec.imageIds.filter(id => id !== imageId) }
        : sec
    ),
    sectionsDirtyAt: markDirty(),
  })),

  reorderSectionImages: (sectionId, activeId, overId) => set(s => ({
    sections: s.sections.map(sec => {
      if (sec.id !== sectionId) return sec
      const from = sec.imageIds.indexOf(activeId)
      const to = sec.imageIds.indexOf(overId)
      if (from < 0 || to < 0) return sec
      return { ...sec, imageIds: arrayMove(sec.imageIds, from, to) }
    }),
    sectionsDirtyAt: markDirty(),
  })),

  setSectionNamingMode: (sectionId, mode, prefix) => set(s => ({
    sections: s.sections.map(sec =>
      sec.id === sectionId
        ? { ...sec, namingMode: mode, customPrefix: prefix ?? sec.customPrefix }
        : sec
    )
  })),

  setActiveSectionFilter: (id) => set({ activeSectionFilter: id }),
  togglePanel: () => set(s => ({ isPanelOpen: !s.isPanelOpen })),
  openPublishModal: () => set({ isPublishModalOpen: true, publishDone: false, publishError: null }),
  closePublishModal: () => set({ isPublishModalOpen: false }),

  publishSections: async (images) => {
    const dirResult = await window.api.choosePublishDir()
    if (!dirResult) return

    const { sections } = get()
    const imgMap = new Map(images.map(i => [i.id, i]))

    const sectionExports = sections
      .filter(sec => sec.imageIds.length > 0)
      .map(sec => ({
        name: sec.name,
        images: computeDestNames(sec.imageIds, imgMap, sec.namingMode, sec.customPrefix)
      }))

    set({ isPublishing: true, publishError: null, publishDone: false, publishOutputDir: dirResult })

    const result = await window.api.publishSections({
      outputDir: dirResult,
      sections: sectionExports
    })

    if (result.success) {
      set({ isPublishing: false, publishDone: true })
    } else {
      set({ isPublishing: false, publishError: result.error ?? 'Unknown error' })
    }
  },

  resetForFolder: () => set({
    sections: [],
    activeSectionFilter: null,
    isPublishModalOpen: false,
    isPublishing: false,
    publishDone: false,
    publishError: null,
    publishOutputDir: null,
    sectionsDirtyAt: 0,
  }),

  markSectionsClean: () => set({ sectionsDirtyAt: 0 }),
}))
