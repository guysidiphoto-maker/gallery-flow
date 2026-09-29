import { useEffect, useState } from 'react'
import type { GalleryImage, GallerySection } from '@/shared/types'
import {
  ALL_IMAGES_ANCHOR, anchorForParam, currentSectionParam, sectionAnchor, slugForAnchor,
} from '../lib/sectionPaging'

/**
 * Sections render as pages with their own URL (/<gallery>/<section-slug>). While
 * the face filter is on they flatten into stacked chapters with a scroll-spy.
 */
export function useSectionNav(opts: {
  sections: GallerySection[]
  images: GalleryImage[]
  galleryBasePath: string | null
  faceFilterActive: boolean
  showWelcome: boolean
}) {
  const { sections, images, galleryBasePath, faceFilterActive, showWelcome } = opts
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string>(ALL_IMAGES_ANCHOR)
  const pagedMode = sections.length > 0 && !faceFilterActive

  const firstSectionWithImages = () => sections.find(s => images.some(im => im.section_id === s.id))

  // push=false for back/forward, where the browser already changed the URL.
  const openSectionPage = (anchorId: string, push = true) => {
    setActiveSectionAnchor(anchorId)
    if (push && galleryBasePath) {
      try {
        const slug = slugForAnchor(anchorId, sections)
        if (slug) window.history.pushState(null, '', `${galleryBasePath}/${encodeURIComponent(slug)}`)
      } catch { /* URL sync is a nicety, never load-bearing */ }
    }
    // Wait a tick so the new page's block is mounted before scrolling.
    setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
  }

  // On load: the section the URL deep-links to, else the first with photos.
  useEffect(() => {
    if (!pagedMode || images.length === 0) return
    const fromUrl = anchorForParam(currentSectionParam(galleryBasePath), sections)
    if (fromUrl) { setActiveSectionAnchor(fromUrl); return }
    const first = firstSectionWithImages()
    if (first) setActiveSectionAnchor(sectionAnchor(first.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedMode, sections, images.length])

  useEffect(() => {
    if (!pagedMode) return
    const onPop = () => {
      const anchor = anchorForParam(currentSectionParam(galleryBasePath), sections)
      if (anchor) { openSectionPage(anchor, false); return }
      const first = firstSectionWithImages()
      if (first) openSectionPage(sectionAnchor(first.id), false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedMode, sections, images])

  // Scroll-spy for stacked chapters only; in paged mode navigation drives the anchor.
  useEffect(() => {
    if (sections.length === 0 || showWelcome || pagedMode) return
    const elements = sections
      .map(sec => document.getElementById(sectionAnchor(sec.id)))
      .filter((e): e is HTMLElement => !!e)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the chapter crossing the nav line over one already deep in view.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSectionAnchor(visible[0].target.id)
      },
      { rootMargin: '-70px 0px -40% 0px', threshold: 0 },
    )
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, showWelcome, images])

  // First load with a #hash: scroll to it once the grid has mounted.
  useEffect(() => {
    if (showWelcome || images.length === 0) return
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    const id = setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
    return () => clearTimeout(id)
  }, [showWelcome, images.length])

  /** Pill click: switch page in paged mode, else smooth-jump to the chapter. */
  const jumpTo = (id: string) => {
    if (pagedMode) { openSectionPage(id); return }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return { activeSectionAnchor, pagedMode, jumpTo }
}
