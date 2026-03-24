import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { nanoid } from '../utils/nanoid'
import type { ImageFile, Section, SectionNamingMode } from '../types'

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
  activeSectionFilter: string | null  // null = all, sectionId = section
  isPanelOpen: boolean
  isPublishModalOpen: boolean
  isPublishing: boolean
  publishError: string | null
  publishDone: boolean
  publishOutputDir: string | null

  // CRUD
  addSection: (name: string) => void
  renameSection: (id: string, name: string) => void
  deleteSection: (id: string) => void

  // Image assignment
  addImagesToSection: (imageIds: string[], sectionId: string) => void
  moveImagesToSection: (imageIds: string[], sectionId: string) => void
  removeImageFromSection: (imageId: string, sectionId: string) => void
  reorderSectionImages: (sectionId: string, activeId: string, overId: string) => void

  // Settings
  setSectionNamingMode: (sectionId: string, mode: SectionNamingMode, prefix?: string) => void

  // UI
  setActiveSectionFilter: (id: string | null) => void
  togglePanel: () => void
  openPublishModal: () => void
  closePublishModal: () => void

  // Publish
  publishSections: (images: ImageFile[]) => Promise<void>

  // Reset on folder change
  resetForFolder: () => void
}

export const useSections = create<SectionsState>((set, get) => ({
  sections: [],
  activeSectionFilter: null,
  isPanelOpen: false,
  isPublishModalOpen: false,
  isPublishing: false,
  publishError: null,
  publishDone: false,
  publishOutputDir: null,

  addSection: (name) => {
    const section: Section = {
      id: nanoid(),
      name: name.trim() || 'New Section',
      imageIds: [],
      namingMode: 'sequential',
      customPrefix: ''
    }
    set(s => ({ sections: [...s.sections, section] }))
  },

  renameSection: (id, name) => set(s => ({
    sections: s.sections.map(sec =>
      sec.id === id ? { ...sec, name: name.trim() || sec.name } : sec
    )
  })),

  deleteSection: (id) => set(s => ({
    sections: s.sections.filter(sec => sec.id !== id),
    activeSectionFilter: s.activeSectionFilter === id ? null : s.activeSectionFilter
  })),

  addImagesToSection: (imageIds, sectionId) => set(s => ({
    sections: s.sections.map(sec => {
      if (sec.id !== sectionId) return sec
      const existing = new Set(sec.imageIds)
      const toAdd = imageIds.filter(id => !existing.has(id))
      return { ...sec, imageIds: [...sec.imageIds, ...toAdd] }
    })
  })),

  moveImagesToSection: (imageIds, sectionId) => set(s => {
    const idSet = new Set(imageIds)
    return {
      sections: s.sections.map(sec => {
        if (sec.id === sectionId) {
          const existing = new Set(sec.imageIds)
          const toAdd = imageIds.filter(id => !existing.has(id))
          return { ...sec, imageIds: [...sec.imageIds, ...toAdd] }
        }
        // Remove from all other sections
        return { ...sec, imageIds: sec.imageIds.filter(id => !idSet.has(id)) }
      })
    }
  }),

  removeImageFromSection: (imageId, sectionId) => set(s => ({
    sections: s.sections.map(sec =>
      sec.id === sectionId
        ? { ...sec, imageIds: sec.imageIds.filter(id => id !== imageId) }
        : sec
    )
  })),

  reorderSectionImages: (sectionId, activeId, overId) => set(s => ({
    sections: s.sections.map(sec => {
      if (sec.id !== sectionId) return sec
      const from = sec.imageIds.indexOf(activeId)
      const to = sec.imageIds.indexOf(overId)
      if (from < 0 || to < 0) return sec
      return { ...sec, imageIds: arrayMove(sec.imageIds, from, to) }
    })
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

    // Compute per-section images
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
    publishOutputDir: null
  })
}))
