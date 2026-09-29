import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { getBrandKit } from '@/features/brand-kit/brandKit'
import { toPlannerImages, toBrandResolved, type GalleryImageRow } from '@/features/story-studio/galleryAdapter'
import type { PlannerImage } from '@/features/story-studio/planner'
import type { BrandResolved } from '@/features/story-studio/sceneplan'
import {
  requestStoryGeneration, pollStoryRender, estimateRenderSeconds, formatStoryDuration,
  STORY_DEFAULT_PHOTO_BUDGET, STORY_MIN_PHOTOS, STORY_MAX_PHOTOS, type StoryStyle,
} from '../../lib/storyRender'
import { bySortOrder } from '../../lib/photoOrder'
import { STORY_COLUMNS, type Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

// Below ~12 photos a story looks like a slideshow; above 60 the render runs away.
export const STORY_GENERATE_MIN_PHOTOS = STORY_MIN_PHOTOS
export const STORY_GENERATE_MAX_PHOTOS = STORY_MAX_PHOTOS

export interface StudioData {
  images: PlannerImage[]
  brand: BrandResolved
  event: { title?: string; date?: string; location?: string }
}

// Automated story generation (style picker + curated shot list → render +
// status polling) and the Story Studio launcher data.
export function useStoryGeneration(deps: {
  session: EditorSession
  businessId: string | null
  showToast: Toast
}) {
  const { session, businessId, showToast } = deps
  const { editingGallery, galleryImages, setStories } = session
  const [showStoryStyleModal, setShowStoryStyleModal] = useState(false)
  const [studioData, setStudioData] = useState<StudioData | null>(null)
  const [storyGenStyle, setStoryGenStyle] = useState<StoryStyle>('clean')
  const [storyGenerating, setStoryGenerating] = useState(false)
  // Ordered image ids for the story; null = defaults (favorites, else first N).
  const [storyCandidateIds, setStoryCandidateIds] = useState<string[] | null>(null)
  const [storyShowAddPicker, setStoryShowAddPicker] = useState(false)
  // Only one render is followed at a time; cleared on cancel / gallery switch.
  const storyPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const storyPollRenderIdRef = useRef<string | null>(null)

  // Stop polling when the editor closes or switches gallery.
  useEffect(() => {
    if (!editingGallery) {
      if (storyPollTimerRef.current) {
        clearInterval(storyPollTimerRef.current)
        storyPollTimerRef.current = null
      }
      storyPollRenderIdRef.current = null
    }
    return () => {
      if (storyPollTimerRef.current) {
        clearInterval(storyPollTimerRef.current)
        storyPollTimerRef.current = null
      }
      storyPollRenderIdRef.current = null
    }
  }, [editingGallery?.id])

  function stopStoryPoll() {
    if (storyPollTimerRef.current) {
      clearInterval(storyPollTimerRef.current)
      storyPollTimerRef.current = null
    }
    storyPollRenderIdRef.current = null
  }

  // The status endpoint inserts the row on 'ready', so a re-select shows it.
  async function refreshStoriesForCurrentGallery() {
    if (!editingGallery) return
    const { data } = await supabase
      .from('stories')
      .select(STORY_COLUMNS)
      .eq('gallery_id', editingGallery.id)
      .order('created_at', { ascending: true })
    setStories(data ?? [])
  }

  function startStoryPoll(renderId: string) {
    stopStoryPoll()
    storyPollRenderIdRef.current = renderId
    storyPollTimerRef.current = setInterval(() => {
      const activeId = storyPollRenderIdRef.current
      if (!activeId) {
        stopStoryPoll()
        return
      }
      void pollStoryRender(activeId).then(snapshot => {
        // Ignore late ticks after the user navigated away.
        if (storyPollRenderIdRef.current !== activeId) return
        if (snapshot.status === 'ready') {
          stopStoryPoll()
          void refreshStoriesForCurrentGallery()
          showToast({ kind: 'success', text: 'הסטורי מוכן' })
        } else if (snapshot.status === 'failed') {
          stopStoryPoll()
          showToast({
            kind: 'error',
            text: `יצירת הסטורי נכשלה: ${snapshot.error_message ?? snapshot.error ?? 'שגיאה לא ידועה'}`,
          })
        }
      })
    }, 5000)
  }

  // Opens the picker with a concrete default shot list to edit.
  function openGenerateModal() {
    setStoryGenStyle('clean')
    const favs = galleryImages
      .filter(i => i.is_top_pick)
      .sort(bySortOrder)
      .map(i => i.id)
    const defaults = favs.length > 0
      ? favs.slice(0, STORY_GENERATE_MAX_PHOTOS)
      : galleryImages
          .slice()
          .sort(bySortOrder)
          .slice(0, STORY_DEFAULT_PHOTO_BUDGET)
          .map(i => i.id)
    setStoryCandidateIds(defaults)
    setStoryShowAddPicker(false)
    setShowStoryStyleModal(true)
  }

  function closeGenerateModal() {
    if (!storyGenerating) setShowStoryStyleModal(false)
  }

  async function handleGenerateStoryConfirm() {
    if (!editingGallery || storyGenerating) return
    // Send the curated list explicitly so the render matches the preview.
    const photoIds = storyCandidateIds && storyCandidateIds.length >= STORY_GENERATE_MIN_PHOTOS
      ? storyCandidateIds
      : undefined
    setStoryGenerating(true)
    const estSec = estimateRenderSeconds(photoIds?.length ?? STORY_DEFAULT_PHOTO_BUDGET, storyGenStyle)
    showToast({ kind: 'info', text: `מייצר סטורי — ${formatStoryDuration(estSec)}` })
    const result = await requestStoryGeneration(editingGallery.id, storyGenStyle, photoIds)
    setStoryGenerating(false)
    setShowStoryStyleModal(false)
    if (result.ok) {
      showToast({
        kind: 'success',
        text: result.message === 'render_in_progress'
          ? 'הסטורי כבר בעיבוד — נמשיך לעקוב'
          : 'הסטורי נשלח לעיבוד',
      })
      if (result.renderId) startStoryPoll(result.renderId)
    } else {
      showToast({
        kind: 'error',
        text: result.userError ?? `יצירת הסטורי נכשלה: ${result.error ?? 'שגיאה לא ידועה'}`,
      })
    }
  }

  function removeCandidate(id: string) {
    setStoryCandidateIds(prev => (prev ?? []).filter(x => x !== id))
  }

  function addCandidate(id: string) {
    setStoryCandidateIds(prev => {
      const base = prev ?? []
      if (base.includes(id)) return base
      if (base.length >= STORY_GENERATE_MAX_PHOTOS) return base
      return [...base, id]
    })
  }

  function reorderCandidate(from: string, to: string) {
    if (from === to) return
    setStoryCandidateIds(prev => {
      const base = (prev ?? []).slice()
      const fromIdx = base.indexOf(from)
      const toIdx = base.indexOf(to)
      if (fromIdx === -1 || toIdx === -1) return base
      const [moved] = base.splice(fromIdx, 1)
      base.splice(toIdx, 0, moved)
      return base
    })
  }

  // Story Studio on the real gallery: planner images + resolved brand + event.
  async function openStudio() {
    if (!editingGallery) return
    try {
      const ds = (editingGallery.delivery_settings || {}) as Record<string, unknown>
      const bk = businessId
        ? ((await getBrandKit(businessId)) as {
            colors?: { accent?: string }
            typography?: { heading_family?: string; body_family?: string }
            logo?: { url?: string }
            voice?: { signature?: string }
            watermark?: { enabled?: boolean; opacity_percent?: number }
          } | null)
        : null
      const eg = editingGallery as { name?: string; event_date?: string; event_location?: string }
      setStudioData({
        images: toPlannerImages(galleryImages as unknown as GalleryImageRow[]),
        brand: toBrandResolved({
          accentHex: (ds.themeColor as string) || bk?.colors?.accent,
          headingFont: bk?.typography?.heading_family,
          bodyFont: bk?.typography?.body_family,
          studioName: (ds.studioName as string) || bk?.voice?.signature,
          // Only an http(s) logo: the gallery override is often a stale local
          // path that 404s and crashes the render, so fall back to the brand kit.
          logoUrl: [ds.logoUrl as string | undefined, bk?.logo?.url].find(
            (u) => typeof u === 'string' && /^https?:\/\//i.test(u),
          ) || null,
          watermarkEnabled: bk?.watermark?.enabled,
          watermarkOpacityPercent: bk?.watermark?.opacity_percent,
        }),
        event: {
          title: eg.name || (ds.galleryTitle as string) || undefined,
          date: eg.event_date || (ds.eventDate as string) || undefined,
          location: eg.event_location || (ds.eventLocation as string) || undefined,
        },
      })
    } catch (err) {
      console.error('[story-studio] open failed', err)
    }
  }

  return {
    showStoryStyleModal, openGenerateModal, closeGenerateModal,
    studioData, setStudioData, openStudio,
    storyGenStyle, setStoryGenStyle,
    storyGenerating,
    storyCandidateIds, removeCandidate, addCandidate, reorderCandidate,
    storyShowAddPicker, setStoryShowAddPicker,
    handleGenerateStoryConfirm,
  }
}

export type StoryGenerationApi = ReturnType<typeof useStoryGeneration>
