// Single grid-layout resolver so the editor preview can never differ from Live.
// Design-tab keys (thumbnailSize/gridSpacing) win; legacy layoutMode/imageSpacing
// are the fallback so older galleries keep their look.

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

/** `isFeedMode` (mobile single-column feed) overrides everything. */
export function resolveGridLayout(
  raw: Record<string, unknown> | null | undefined,
  isFeedMode = false,
): ResolvedGridLayout {
  const thumbnailSize = str(raw, 'thumbnailSize')
  const gridSpacing = str(raw, 'gridSpacing')

  const layoutFromThumb: LayoutMode | null =
    thumbnailSize === 'full' ? '1-col' : thumbnailSize === 'large' ? '2-col' : thumbnailSize === 'regular' ? '3-col' : null
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
