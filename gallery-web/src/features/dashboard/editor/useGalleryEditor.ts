import type React from 'react'
import { useActivitySummary } from '../hooks/useActivitySummary'
import type { CustomDomainState } from '../hooks/useCustomDomain'
import type { Confirm, Gallery, Toast } from '../types'
import { useEditorSession } from './useEditorSession'
import { useGallerySettings } from './useGallerySettings'
import { useCover } from './useCover'
import { usePresets } from './usePresets'
import { useGalleryExport } from './useGalleryExport'
import { useSections } from './photos/useSections'
import { usePhotoUpload } from './photos/usePhotoUpload'
import { usePhotoActions } from './photos/usePhotoActions'
import { useStories } from './stories/useStories'
import { useStoryGeneration } from './stories/useStoryGeneration'

export interface EditorDeps {
  businessId: string | null
  businessSlug: string | null
  setGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>
  fetchGalleries: () => void
  tokenBalance: number
  fetchTokenBalance: () => void
  openBuyTokens: () => void
  customDomain: CustomDomainState
  showToast: Toast
  confirm: Confirm
}

// Composes the gallery editor's state, grouped by concern. Lives at the page
// level because some editor surfaces (lightbox, upload review, story modal)
// render outside the editor dialog.
export function useGalleryEditor(deps: EditorDeps) {
  const { businessId, businessSlug, setGalleries, fetchGalleries, showToast, confirm } = deps
  const session = useEditorSession({ showToast, fetchGalleries })
  const { editingGallery, setEditingGallery, galleryImages, editTab, markDirty } = session

  const settings = useGallerySettings({ editingGallery, setEditingGallery, setGalleries, markDirty, showToast })
  const { updateGallerySettings } = settings
  const activity = useActivitySummary(editTab, editingGallery?.id)
  const presets = usePresets({ businessId, editingGallery, editTab, updateGallerySettings, confirm, showToast })
  const cover = useCover({ editingGallery, galleryImages, businessId, businessSlug, updateGallerySettings, showToast })
  const exporter = useGalleryExport({ editingGallery, galleryImages, confirm })
  const sections = useSections({ session, fetchGalleries, confirm, showToast })
  const upload = usePhotoUpload({
    session, businessId, businessSlug,
    tokenBalance: deps.tokenBalance,
    fetchTokenBalance: deps.fetchTokenBalance,
    openBuyTokens: deps.openBuyTokens,
    ensureUploadSection: sections.ensureUploadSection,
    fetchGalleries, showToast,
  })
  const photos = usePhotoActions({
    session, businessSlug, updateGallerySettings, clearCover: cover.clearCover,
    fetchGalleries, confirm, showToast,
  })
  const stories = useStories({ session, businessSlug, showToast })
  const storyGen = useStoryGeneration({ session, businessId, showToast })

  return {
    session, settings, activity, presets, cover, exporter,
    sections, upload, photos, stories, storyGen,
    businessId, showToast,
    customDomain: deps.customDomain,
  }
}

export type GalleryEditorState = ReturnType<typeof useGalleryEditor>
