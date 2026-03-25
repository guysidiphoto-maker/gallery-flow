/**
 * Demo Mode — scripted, cinematic walkthrough of GalleryFlow features.
 * No disk writes: rename preview is shown then cancelled; export UI is
 * displayed but not triggered. Gallery state changes (picks, sections)
 * remain after demo completes so the user can see the result.
 */

import { create } from 'zustand'
import { useGallery } from './gallery'
import { useSections } from './sections'
import { useSocial } from './social'

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export type DemoPhase = 'idle' | 'intro' | 'running' | 'done'

interface DemoState {
  phase: DemoPhase
  step: string
  progress: number
  startDemo: () => Promise<void>
  stopDemo: () => void
}

export const useDemo = create<DemoState>((set, get) => ({
  phase: 'idle',
  step: '',
  progress: 0,

  stopDemo: () => {
    // Close any modals opened during the demo
    const gallery = useGallery.getState()
    if (gallery.showStoryModal) gallery.closeStoryModal()
    if (gallery.showRenamePreview) gallery.cancelApplyOrder()
    useSocial.getState().closeSocial()
    set({ phase: 'idle', step: '', progress: 0 })
  },

  startDemo: async () => {
    const { phase } = get()
    if (phase !== 'idle') return

    const gallery = useGallery.getState()
    if (gallery.images.length < 3) {
      gallery.addToast('Open a folder with at least 3 images to run the demo', 'error')
      return
    }

    // Helper: check if demo is still running (user may hit Stop)
    const alive = () => get().phase !== 'idle'

    const step = (text: string, progress: number) =>
      set({ step: text, progress })

    // ── Intro curtain ────────────────────────────────────────────────────────
    set({ phase: 'intro', step: 'GalleryFlow', progress: 0 })
    await pause(2400)
    if (!alive()) return
    set({ phase: 'running' })

    // ── 1. Select images one by one ──────────────────────────────────────────
    step('Selecting the best shots…', 5)
    await pause(800)
    if (!alive()) return

    useGallery.getState().deselectAll()
    await pause(250)

    const images = useGallery.getState().images
    const pickCount = Math.min(5, images.length)

    for (let i = 0; i < pickCount; i++) {
      if (!alive()) return
      useGallery.getState().selectImage(images[i].id, true)
      await pause(380)
    }
    await pause(300)

    // ── 2. Mark as Top Picks ─────────────────────────────────────────────────
    if (!alive()) return
    step('Marking as Top Picks…', 22)
    await pause(700)

    // toggleTopPickSelected is async at runtime even though typed as void
    const pickResult = useGallery.getState().toggleTopPickSelected()
    if (pickResult instanceof Promise) await pickResult
    await pause(1300)

    // ── 3. Rename preview (no commit) ────────────────────────────────────────
    if (!alive()) return
    step('Previewing sequential rename…', 37)
    await pause(700)

    useGallery.getState().prepareApplyOrder()
    await pause(2300)

    if (!alive()) return
    useGallery.getState().cancelApplyOrder()
    await pause(500)

    // ── 4. Sections ──────────────────────────────────────────────────────────
    if (!alive()) return
    step('Creating a curated section…', 52)

    const panelWasOpen = useSections.getState().isPanelOpen
    if (!panelWasOpen) useSections.getState().togglePanel()
    await pause(900)

    if (!alive()) return
    useSections.getState().addSection('Best Shots')
    await pause(1500)

    if (!alive()) return
    if (!panelWasOpen) useSections.getState().togglePanel()
    await pause(400)

    // ── 5. Story Creator ─────────────────────────────────────────────────────
    if (!alive()) return
    step('Crafting a Story Video…', 64)
    await pause(600)

    useGallery.getState().openStoryModal()
    await pause(3000)

    if (!alive()) return
    useGallery.getState().closeStoryModal()
    await pause(500)

    // ── 6. Instagram Grid → Posting Order → Export ───────────────────────────
    if (!alive()) return
    step('Planning the Instagram grid…', 76)
    await pause(600)

    const g = useGallery.getState()
    useSocial.getState().openSocial()
    useSocial.getState().initFromPicks(g.images, g.topPickIds)
    await pause(2200)

    if (!alive()) return
    step('Reviewing posting order…', 86)
    useSocial.getState().setScreen('posting-assistant')
    await pause(1700)

    if (!alive()) return
    step('Ready to export…', 94)
    useSocial.getState().setScreen('handoff')
    await pause(1900)

    if (!alive()) return
    useSocial.getState().closeSocial()
    await pause(400)

    // ── Outro curtain ─────────────────────────────────────────────────────────
    if (!alive()) return
    set({ phase: 'done', step: 'GalleryFlow', progress: 100 })
    await pause(3200)

    if (alive()) get().stopDemo()
  }
}))
