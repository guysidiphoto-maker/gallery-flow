import { useEffect, useLayoutEffect } from 'react'
import { fontFamilyCss, resolveGalleryBranding, type BrandDefaults } from '@/shared/gallery/galleryBranding'
import type { Gallery } from '@/shared/types'
import type { Lang } from '@/shared/i18n/viewerStrings'
import { ensureWebFonts } from '../lib/webFonts'

/** Marks <html> so viewer.css can apply the page base (body bg/text/font) only while mounted. */
export const VIEWER_ROOT_ATTR = 'data-gallery-viewer'

/**
 * Applies the resolved gallery branding as raw CSS vars on <html> (backing the
 * bg-gallery / text-gallery-* utilities) so it reaches every sub-view, plus dir/lang.
 */
export function useGalleryBranding(gallery: Gallery | null, lang: Lang) {
  // Layout effect: the base must be in place before the first viewer paint.
  useLayoutEffect(() => {
    const el = document.documentElement
    el.setAttribute(VIEWER_ROOT_ATTR, '')
    return () => el.removeAttribute(VIEWER_ROOT_ATTR)
  }, [])

  useEffect(() => {
    if (!gallery) return
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [gallery, lang])

  useEffect(() => {
    const el = document.documentElement
    if (!gallery) return
    const b = resolveGalleryBranding(
      (gallery.delivery_settings ?? {}) as unknown as Record<string, unknown>,
      (gallery as unknown as { brand?: BrandDefaults }).brand,
    )
    el.style.setProperty('--accent', b.accentRgb)
    el.style.setProperty('--accent-ink', b.accentInk)
    el.style.setProperty('--bg', b.theme.bg)
    el.style.setProperty('--surface', b.theme.surface)
    el.style.setProperty('--text', b.theme.text)
    el.style.setProperty('--text-muted', b.theme.textMuted)
    el.setAttribute('data-appearance', b.appearance)
    if (b.headingFont) el.style.setProperty('--font-heading', fontFamilyCss(b.headingFont))
    else el.style.removeProperty('--font-heading')
    if (b.bodyFont) el.style.setProperty('--font-body', fontFamilyCss(b.bodyFont))
    else el.style.removeProperty('--font-body')
    // Defaults mirror --font-gallery-heading (tokens.css) and the viewer.css body stack.
    ensureWebFonts([b.headingFont || 'Playfair Display', b.bodyFont || 'Inter Tight, Noto Sans Hebrew'])
    return () => {
      el.style.removeProperty('--accent')
      el.style.removeProperty('--accent-ink')
      el.style.removeProperty('--bg')
      el.style.removeProperty('--surface')
      el.style.removeProperty('--text')
      el.style.removeProperty('--text-muted')
      el.removeAttribute('data-appearance')
      el.style.removeProperty('--font-heading')
      el.style.removeProperty('--font-body')
    }
  }, [gallery])
}
