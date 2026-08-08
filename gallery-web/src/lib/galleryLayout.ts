// galleryLayout.ts — the ONE place that turns a gallery's saved delivery_settings
// into resolved grid layout values (column mode + spacing + pixel gap). The
// public viewer, the editor preview, and the Preview route all resolve layout
// through here so the editor can never show a grid that differs from Live.
//
// Design tab keys (thumbnailSize / gridSpacing) take precedence; legacy keys
// (layoutMode / imageSpacing) are the fallback so galleries created before the
// Design tab keep their exact appearance.

export type LayoutMode = '1-col' | '2-col' | '3-col'
export type ImageSpacing = 'none' | 'small' | 'medium' | 'wide'

export interface ResolvedGridLayout {
  layoutMode: LayoutMode
  imageSpacing: ImageSpacing
}

function str(raw: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = raw?.[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Resolve the grid layout for a gallery.
 *
 * @param raw        gallery.delivery_settings
 * @param isFeedMode mobile single-column "feed" override (wins over everything)
 */
export function resolveGridLayout(
  raw: Record<string, unknown> | null | undefined,
  isFeedMode = false,
): ResolvedGridLayout {
  const thumbnailSize = str(raw, 'thumbnailSize')
  const gridSpacing = str(raw, 'gridSpacing')

  // thumbnailSize → column mode. 'regular' = more, smaller columns (3-col →
  // 4 desktop cols); 'large' = fewer, bigger (2-col → 3 desktop cols).
  const layoutFromThumb: LayoutMode | null =
    thumbnailSize === 'large' ? '2-col' : thumbnailSize === 'regular' ? '3-col' : null
  // gridSpacing → gap tier. 'large' maps to a genuinely wide gap so the choice
  // is obvious on desktop; 'regular' stays tight.
  const spacingFromGrid: ImageSpacing | null =
    gridSpacing === 'large' ? 'wide' : gridSpacing === 'regular' ? 'small' : null

  const layoutMode: LayoutMode = isFeedMode
    ? '1-col'
    : (layoutFromThumb ?? (str(raw, 'layoutMode') as LayoutMode | null) ?? '2-col')
  const imageSpacing: ImageSpacing = isFeedMode
    ? 'none'
    : (spacingFromGrid ?? (str(raw, 'imageSpacing') as ImageSpacing | null) ?? 'small')

  return { layoutMode, imageSpacing }
}

/** Pixel gap between grid tiles for a resolved spacing tier. */
export function gapForSpacing(imageSpacing: string): number {
  switch (imageSpacing) {
    case 'none': return 0
    case 'wide': return 22
    case 'medium': return 10
    default: return 4 // 'small' and any legacy/unknown value
  }
}
