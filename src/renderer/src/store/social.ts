import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { nanoid } from '../utils/nanoid'
import type { ImageFile, SocialPost, SplitLayout, SocialExportScene, CropState } from '../types'

function splitTileCount(layout: SplitLayout): number {
  switch (layout) {
    case '2h': return 2
    case '3h': return 3
    case '2v': return 2
    case '4':  return 4
    case '6':  return 6
    case '9':  return 9
  }
}

export type SocialScreen = 'grid' | 'split-builder' | 'carousel-builder' | 'posting-assistant' | 'handoff'

interface SocialState {
  isOpen: boolean
  screen: SocialScreen
  posts: SocialPost[]

  // Split builder
  splitTargetId: string | null
  splitSelectedLayout: SplitLayout

  // Carousel builder
  carouselTargetId: string | null
  carouselSelectedIds: string[]

  // Export
  exportProgress: number
  exportStage: string
  exportDir: string | null
  isExporting: boolean
  exportDone: boolean
  exportError: string | null

  // Crop
  cropStates: Record<string, CropState>
  cropAdjustPostId: string | null
  includeOrderOverlay: boolean

  // Lock
  lockedPostIds: Set<string>

  // Actions
  openSocial: () => void
  closeSocial: () => void
  initFromPicks: (images: ImageFile[], topPickIds: Set<string>) => void
  reorderPosts: (fromIndex: number, toIndex: number) => void
  convertToSplit: (postId: string, layout: SplitLayout) => void
  revertToSingle: (splitGroupId: string) => void
  startCarouselBuilder: (postId: string) => void
  toggleCarouselImage: (imageId: string) => void
  confirmCarousel: () => void
  ungroupCarousel: (postId: string) => void
  autoArrange: (images: ImageFile[]) => void
  setScreen: (screen: SocialScreen) => void
  startSplitBuilder: (postId: string) => void
  setSplitLayout: (layout: SplitLayout) => void
  confirmSplit: () => void
  exportPackage: (imagePathMap: Map<string, string>) => Promise<void>
  startCropAdjust: (postId: string) => void
  saveCropState: (postId: string, state: CropState) => void
  closeCropAdjust: () => void
  setIncludeOrderOverlay: (v: boolean) => void
  toggleLockPost: (postId: string) => void
}

export const useSocial = create<SocialState>((set, get) => ({
  isOpen: false,
  screen: 'grid',
  posts: [],
  splitTargetId: null,
  splitSelectedLayout: '2h',
  carouselTargetId: null,
  carouselSelectedIds: [],
  exportProgress: 0,
  exportStage: '',
  exportDir: null,
  isExporting: false,
  exportDone: false,
  exportError: null,
  cropStates: {},
  cropAdjustPostId: null,
  includeOrderOverlay: false,
  lockedPostIds: new Set(),

  openSocial: () => set({ isOpen: true, screen: 'grid', exportDone: false, exportDir: null, exportError: null, lockedPostIds: new Set() }),

  closeSocial: () => set({ isOpen: false }),

  initFromPicks: (images, topPickIds) => {
    const picks = images.filter(img => topPickIds.has(img.id))
    const posts: SocialPost[] = picks.map(img => ({
      id: nanoid(),
      type: 'single',
      imageIds: [img.id]
    }))
    set({ posts })
  },

  reorderPosts: (fromIndex, toIndex) => {
    const { lockedPostIds, posts } = get()
    if (lockedPostIds.has(posts[fromIndex]?.id)) return  // locked posts can't be moved
    set(state => ({ posts: arrayMove(state.posts, fromIndex, toIndex) }))
  },

  startSplitBuilder: (postId) => {
    const post = get().posts.find(p => p.id === postId)
    if (!post || post.type !== 'single') return
    set({ splitTargetId: postId, splitSelectedLayout: '2h', screen: 'split-builder' })
  },

  setSplitLayout: (layout) => set({ splitSelectedLayout: layout }),

  confirmSplit: () => {
    const { splitTargetId, splitSelectedLayout, posts } = get()
    if (!splitTargetId) return
    const targetIdx = posts.findIndex(p => p.id === splitTargetId)
    if (targetIdx < 0) return
    const target = posts[targetIdx]
    if (target.type !== 'single') return

    const count = splitTileCount(splitSelectedLayout)
    const groupId = nanoid()
    const tiles: SocialPost[] = Array.from({ length: count }, (_, i) => ({
      id: nanoid(),
      type: 'split-tile' as const,
      imageIds: target.imageIds,
      splitGroupId: groupId,
      splitLayout: splitSelectedLayout,
      splitTileIndex: i,
      splitTotalTiles: count
    }))

    const newPosts = [...posts]
    newPosts.splice(targetIdx, 1, ...tiles)
    set({ posts: newPosts, splitTargetId: null, screen: 'grid' })
  },

  revertToSingle: (splitGroupId) => {
    const { posts } = get()
    const firstTile = posts.find(p => p.splitGroupId === splitGroupId)
    if (!firstTile) return
    const sourceImageId = firstTile.imageIds[0]
    const firstIdx = posts.findIndex(p => p.splitGroupId === splitGroupId)
    const remaining = posts.filter(p => p.splitGroupId !== splitGroupId)
    const single: SocialPost = { id: nanoid(), type: 'single', imageIds: [sourceImageId] }
    remaining.splice(firstIdx, 0, single)
    set({ posts: remaining })
  },

  startCarouselBuilder: (postId) => {
    const post = get().posts.find(p => p.id === postId)
    if (!post) return
    set({
      carouselTargetId: postId,
      carouselSelectedIds: [...post.imageIds],
      screen: 'carousel-builder'
    })
  },

  toggleCarouselImage: (imageId) => {
    const { carouselSelectedIds } = get()
    const next = carouselSelectedIds.includes(imageId)
      ? carouselSelectedIds.filter(id => id !== imageId)
      : [...carouselSelectedIds, imageId]
    set({ carouselSelectedIds: next })
  },

  confirmCarousel: () => {
    const { carouselTargetId, carouselSelectedIds, posts } = get()
    if (!carouselTargetId || carouselSelectedIds.length < 2) return
    const targetIdx = posts.findIndex(p => p.id === carouselTargetId)
    if (targetIdx < 0) return

    // Remove all posts whose imageIds[0] is in carouselSelectedIds (single posts)
    // and replace the target post with a carousel post
    const involvedImageIds = new Set(carouselSelectedIds)
    const newPosts = posts.filter(p => {
      if (p.id === carouselTargetId) return false
      if (p.type === 'single' && involvedImageIds.has(p.imageIds[0])) return false
      return true
    })

    const carousel: SocialPost = {
      id: nanoid(),
      type: 'carousel',
      imageIds: carouselSelectedIds
    }
    newPosts.splice(targetIdx, 0, carousel)
    set({ posts: newPosts, carouselTargetId: null, carouselSelectedIds: [], screen: 'grid' })
  },

  ungroupCarousel: (postId) => {
    const { posts } = get()
    const idx = posts.findIndex(p => p.id === postId)
    if (idx < 0) return
    const carousel = posts[idx]
    if (carousel.type !== 'carousel') return
    const singles: SocialPost[] = carousel.imageIds.map(imageId => ({
      id: nanoid(),
      type: 'single',
      imageIds: [imageId]
    }))
    const newPosts = [...posts]
    newPosts.splice(idx, 1, ...singles)
    set({ posts: newPosts })
  },

  autoArrange: (images) => {
    const { posts } = get()
    // Build imageId → image map
    const imgMap = new Map(images.map(img => [img.id, img]))

    const newPosts: SocialPost[] = []
    let i = 0
    while (i < posts.length) {
      const post = posts[i]
      if (post.type === 'single') {
        const img = imgMap.get(post.imageIds[0])
        // Group consecutive landscape images into 2h splits if there are 2+
        if (img && img.id) {
          // Lookahead: if next post is also single landscape, make a 2h split
          newPosts.push({ ...post })
        } else {
          newPosts.push({ ...post })
        }
        i++
      } else {
        newPosts.push({ ...post })
        i++
      }
    }
    set({ posts: newPosts })
  },

  setScreen: (screen) => set({ screen }),

  startCropAdjust: (postId) => set({ cropAdjustPostId: postId }),
  saveCropState: (postId, state) => set(s => ({ cropStates: { ...s.cropStates, [postId]: state } })),
  closeCropAdjust: () => set({ cropAdjustPostId: null }),
  setIncludeOrderOverlay: (v) => set({ includeOrderOverlay: v }),

  toggleLockPost: (postId) => set(s => {
    const next = new Set(s.lockedPostIds)
    if (next.has(postId)) next.delete(postId)
    else next.add(postId)
    return { lockedPostIds: next }
  }),

  exportPackage: async (imagePathMap) => {
    const dirResult = await window.api.chooseSocialExportDir()
    if (!dirResult) return

    set({ exportDir: dirResult, exportProgress: 0, exportStage: 'Preparing…', isExporting: true, exportDone: false, exportError: null, screen: 'handoff' })

    const { posts, cropStates } = get()
    const scenes: SocialExportScene[] = posts.map((post, idx) => ({
      postNumber: idx + 1,
      type: post.type,
      imagePaths: post.imageIds.map(id => imagePathMap.get(id) ?? ''),
      splitLayout: post.splitLayout,
      splitTileIndex: post.splitTileIndex,
      isCarousel: post.type === 'carousel',
      cropState: cropStates[post.id],
    })).filter(s => s.imagePaths.every(p => p !== ''))

    const result = await window.api.exportSocialPackage(scenes, dirResult, { includeOrderOverlay: get().includeOrderOverlay })
    if (result.success) {
      set({ isExporting: false, exportDone: true, exportProgress: 100 })
    } else {
      set({ isExporting: false, exportError: result.error ?? 'Unknown error' })
    }
  }
}))
