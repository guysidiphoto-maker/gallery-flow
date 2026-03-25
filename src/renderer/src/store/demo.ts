/**
 * Demo Mode — scripted 40-second cinematic product walkthrough.
 * No disk writes: rename previews are shown then cancelled; export UI is
 * displayed but not triggered. Gallery state (picks, sections) persists
 * after demo so the user can see the result.
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
  titleCard: string | null
  startDemo: () => Promise<void>
  stopDemo: () => void
}

export const useDemo = create<DemoState>((set, get) => ({
  phase: 'idle',
  step: '',
  progress: 0,
  titleCard: null,

  stopDemo: () => {
    const gallery = useGallery.getState()
    if (gallery.showStoryModal) gallery.closeStoryModal()
    if (gallery.showRenamePreview) gallery.cancelApplyOrder()
    useSocial.getState().closeSocial()
    set({ phase: 'idle', step: '', progress: 0, titleCard: null })
  },

  startDemo: async () => {
    const { phase } = get()
    if (phase !== 'idle') return

    const gallery = useGallery.getState()
    if (gallery.images.length < 3) {
      gallery.addToast('Open a folder with at least 3 images to run the demo', 'error')
      return
    }

    const alive = () => get().phase !== 'idle'

    const step = (text: string, progress: number) => set({ step: text, progress })

    // Shows a full-screen title card for ~1.74s (fade-in 220ms + hold 1300ms + fade-out 220ms)
    const showTitle = async (text: string) => {
      if (!alive()) return
      set({ titleCard: text })
      await pause(1740)
      if (!alive()) return
      set({ titleCard: null })
      await pause(280)
    }

    // ── Intro curtain (1.8s) ──────────────────────────────────────────────────
    set({ phase: 'intro', step: 'GalleryFlow', progress: 0 })
    await pause(1800)
    if (!alive()) return
    set({ phase: 'running' })

    useGallery.getState().deselectAll()
    await pause(250)

    // ── Title 1 ───────────────────────────────────────────────────────────────
    step('', 5)
    await showTitle('Turn chaos into order')

    // ── 1. Select images + mark Top Picks ─────────────────────────────────────
    if (!alive()) return
    step('Selecting the best shots…', 10)
    await pause(400)

    const images = useGallery.getState().images
    const pickCount = Math.min(5, images.length)
    for (let i = 0; i < pickCount; i++) {
      if (!alive()) return
      useGallery.getState().selectImage(images[i].id, true)
      await pause(300)
    }
    await pause(250)

    if (!alive()) return
    step('Marking as Top Picks…', 18)
    await pause(500)
    const pickResult = useGallery.getState().toggleTopPickSelected()
    if (pickResult instanceof Promise) await pickResult
    await pause(1000)

    // ── Title 2 ───────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 22)
    await showTitle('Pick your best shots instantly')

    // ── 2. Rename preview ─────────────────────────────────────────────────────
    if (!alive()) return
    step('Previewing sequential rename…', 28)
    await pause(400)
    useGallery.getState().prepareApplyOrder()
    await pause(2200)

    if (!alive()) return
    useGallery.getState().cancelApplyOrder()
    await pause(350)

    // ── Title 3 ───────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 33)
    await showTitle('Reorder and rename automatically')

    // ── 3. Reorder: select different images + rename preview ──────────────────
    if (!alive()) return
    step('Reordering images…', 38)
    await pause(300)

    useGallery.getState().deselectAll()
    await pause(150)

    const imgs2 = useGallery.getState().images
    const reorderCount = Math.min(3, imgs2.length)
    for (let i = imgs2.length - reorderCount; i < imgs2.length; i++) {
      if (!alive()) return
      useGallery.getState().selectImage(imgs2[i].id, true)
      await pause(300)
    }
    await pause(250)

    if (!alive()) return
    step('Renaming to match new order…', 42)
    await pause(300)
    useGallery.getState().prepareApplyOrder()
    await pause(1800)

    if (!alive()) return
    useGallery.getState().cancelApplyOrder()
    await pause(300)

    // ── Title 4 ───────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 48)
    await showTitle('Organize your shoot in seconds')

    // ── 4. Sections ──────────────────────────────────────────────────────────
    if (!alive()) return
    step('Creating a curated section…', 54)

    const panelWasOpen = useSections.getState().isPanelOpen
    if (!panelWasOpen) useSections.getState().togglePanel()
    await pause(700)

    if (!alive()) return
    useSections.getState().addSection('Best Shots')
    await pause(1200)

    if (!alive()) return
    if (!panelWasOpen) useSections.getState().togglePanel()
    await pause(300)

    // ── Title 5 ──────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 60)
    await showTitle('Turn photos into ready Stories')

    // ── 5. Story Creator ─────────────────────────────────────────────────────
    if (!alive()) return
    step('Crafting a Story Video…', 66)
    await pause(400)

    useGallery.getState().openStoryModal()
    await pause(2500)

    if (!alive()) return
    useGallery.getState().closeStoryModal()
    await pause(350)

    // ── Title 6 ──────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 72)
    await showTitle('Plan your feed before posting')

    // ── 6. Instagram: grid → posting order → export UI ───────────────────────
    if (!alive()) return
    step('Planning the Instagram grid…', 77)
    await pause(400)

    const g = useGallery.getState()
    useSocial.getState().openSocial()
    useSocial.getState().initFromPicks(g.images, g.topPickIds)
    await pause(1800)

    if (!alive()) return
    step('Reviewing posting order…', 84)
    useSocial.getState().setScreen('posting-assistant')
    await pause(1300)

    if (!alive()) return
    step('Ready to export…', 91)
    useSocial.getState().setScreen('handoff')
    await pause(1600)

    // ── Title 7 ──────────────────────────────────────────────────────────────
    if (!alive()) return
    step('', 94)
    await showTitle('Export everything in one click')

    if (!alive()) return
    useSocial.getState().closeSocial()
    await pause(250)

    // ── Outro curtain (2.8s) ──────────────────────────────────────────────────
    if (!alive()) return
    set({ phase: 'done', step: 'GalleryFlow', progress: 100 })
    await pause(2800)

    if (alive()) get().stopDemo()
  }
}))
