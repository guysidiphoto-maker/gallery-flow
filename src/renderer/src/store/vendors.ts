import { create } from 'zustand'

export interface Vendor {
  id: string
  name: string
  category: string
  email: string
  instagram: string
  accessCode: string
}

export interface VendorTag {
  imageId: string
  vendorId: string
}

interface VendorsState {
  vendors: Vendor[]
  tags: VendorTag[]          // many-to-many: image ↔ vendor
  isPanelOpen: boolean
  activeVendorFilter: string | null  // null = show all, vendorId = filter
  editingVendorId: string | null

  // CRUD
  addVendor: (name: string, category?: string) => string
  renameVendor: (id: string, name: string) => void
  updateVendor: (id: string, updates: Partial<Vendor>) => void
  deleteVendor: (id: string) => void

  // Tagging (many-to-many)
  tagImages: (imageIds: string[], vendorId: string) => void
  untagImages: (imageIds: string[], vendorId: string) => void
  toggleImageTag: (imageId: string, vendorId: string) => void
  getVendorImages: (vendorId: string) => string[]
  getImageVendors: (imageId: string) => string[]

  // UI
  togglePanel: () => void
  setActiveVendorFilter: (id: string | null) => void
  setEditingVendorId: (id: string | null) => void

  // Bulk
  setVendors: (vendors: Vendor[]) => void
  setTags: (tags: VendorTag[]) => void
  reset: () => void
}

let nextVendorId = 1

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export const useVendors = create<VendorsState>((set, get) => ({
  vendors: [],
  tags: [],
  isPanelOpen: false,
  activeVendorFilter: null,
  editingVendorId: null,

  addVendor: (name, category = '') => {
    const id = `vendor_${++nextVendorId}_${Date.now()}`
    const vendor: Vendor = {
      id, name, category, email: '', instagram: '',
      accessCode: generateCode(),
    }
    set(s => ({ vendors: [...s.vendors, vendor] }))
    return id
  },

  renameVendor: (id, name) => {
    set(s => ({ vendors: s.vendors.map(v => v.id === id ? { ...v, name } : v) }))
  },

  updateVendor: (id, updates) => {
    set(s => ({ vendors: s.vendors.map(v => v.id === id ? { ...v, ...updates } : v) }))
  },

  deleteVendor: (id) => {
    set(s => ({
      vendors: s.vendors.filter(v => v.id !== id),
      tags: s.tags.filter(t => t.vendorId !== id),
      activeVendorFilter: s.activeVendorFilter === id ? null : s.activeVendorFilter,
    }))
  },

  tagImages: (imageIds, vendorId) => {
    set(s => {
      const existing = new Set(s.tags.filter(t => t.vendorId === vendorId).map(t => t.imageId))
      const newTags = imageIds.filter(id => !existing.has(id)).map(imageId => ({ imageId, vendorId }))
      return { tags: [...s.tags, ...newTags] }
    })
  },

  untagImages: (imageIds, vendorId) => {
    const removeSet = new Set(imageIds)
    set(s => ({ tags: s.tags.filter(t => !(t.vendorId === vendorId && removeSet.has(t.imageId))) }))
  },

  toggleImageTag: (imageId, vendorId) => {
    const exists = get().tags.some(t => t.imageId === imageId && t.vendorId === vendorId)
    if (exists) get().untagImages([imageId], vendorId)
    else get().tagImages([imageId], vendorId)
  },

  getVendorImages: (vendorId) => {
    return get().tags.filter(t => t.vendorId === vendorId).map(t => t.imageId)
  },

  getImageVendors: (imageId) => {
    return get().tags.filter(t => t.imageId === imageId).map(t => t.vendorId)
  },

  togglePanel: () => set(s => ({ isPanelOpen: !s.isPanelOpen })),
  setActiveVendorFilter: (id) => set({ activeVendorFilter: id }),
  setEditingVendorId: (id) => set({ editingVendorId: id }),

  setVendors: (vendors) => set({ vendors }),
  setTags: (tags) => set({ tags }),
  reset: () => set({ vendors: [], tags: [], isPanelOpen: false, activeVendorFilter: null, editingVendorId: null }),
}))
