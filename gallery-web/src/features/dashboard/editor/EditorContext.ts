import { createContext, useContext } from 'react'
import type { Gallery } from '../types'
import type { GalleryEditorState } from './useGalleryEditor'

// Page-level gallery actions the editor header's menu reuses.
export interface EditorPageActions {
  shareUrl: (g: { id: string; slug?: string | null }) => string
  openEmailShare: (g: Gallery) => void
  duplicateGallery: (g: Gallery) => Promise<void>
  deleteGallery: (g: Gallery) => Promise<void>
}

export type EditorContextValue = GalleryEditorState & {
  actions: EditorPageActions
  // Grid cover fallback (first photo) for galleries without an explicit cover.
  coverFallback: Record<string, string>
}

export const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used inside EditorContext')
  return ctx
}

/** For components that only render while a gallery is open. */
export function useOpenGallery(): Gallery {
  const g = useEditor().session.editingGallery
  if (!g) throw new Error('useOpenGallery: no gallery is open')
  return g
}
