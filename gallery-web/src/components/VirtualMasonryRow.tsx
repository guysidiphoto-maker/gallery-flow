// VirtualMasonryRow — one virtualized row in the public gallery's masonry.
//
// Why a row renderer (not a per-tile renderer): react-window's grids assume
// uniform tile sizes. Our masonry has variable heights (portrait + landscape
// mixed) but a FIXED column count. The cheapest reconciliation unit that
// stays correct is a single row of `cols` tiles, all clipped to the same
// row height (the row's tallest natural ratio).
//
// Used by App.tsx MasonryGrid when images.length > 300. Below that threshold
// the original column-based masonry is faster (no virtualization overhead,
// no row-height clipping artifacts).

import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import type { GalleryImage } from '../types'
import { SignedImg } from './SignedImg'

export interface VirtualMasonryRowProps {
  /** The slice of images that make up this row (length === cols, possibly fewer on the last row). */
  rowImages: Array<{ img: GalleryImage; index: number }>
  cols: number
  /** Bucket the thumbnails live in — forwarded to SignedImg. */
  imgBucket: string
  /** Gap between tiles AND between rows, in pixels. */
  gap: number
  /** Round tile corners (matches gallery cornerStyle setting). */
  rounded: boolean
  /** `sizes` attribute the responsive image picker should optimise for. */
  imgSizes: string
  /** Eager-load + fetchpriority=high for the first ~2 rows (LCP). */
  eager?: boolean
  onImageClick: (index: number) => void
  /* Optional gallery affordances — kept identical to MasonryGrid so the
   * virtualized + non-virtualized paths render the same UX. */
  onDownload?: (img: GalleryImage) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  clientMode?: boolean
  hiddenIds?: Set<string>
  onToggleHide?: (id: string) => void
  watermark?: { text: string; position: string } | null
  /** Outer style — react-window passes a `style` with absolute positioning. */
  style?: CSSProperties
  /** Optional extra children rendered inside the row container (debug, etc). */
  children?: ReactNode
}

/** A single row of the masonry grid. Always mounts exactly `rowImages.length`
 *  tiles — never the whole gallery. Wraps with forwardRef so react-window
 *  can position the row absolutely without extra DOM. */
export const VirtualMasonryRow = forwardRef<HTMLDivElement, VirtualMasonryRowProps>(function VirtualMasonryRow(
  {
    rowImages,
    cols,
    imgBucket,
    gap,
    rounded,
    imgSizes,
    eager = false,
    onImageClick,
    onDownload,
    selectMode,
    selectedIds,
    onToggleSelect,
    clientMode,
    hiddenIds,
    onToggleHide,
    watermark,
    style,
    children,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        paddingBottom: gap,
        ...style,
      }}
    >
      {rowImages.map(({ img, index }) => {
        const isSelected = selectMode && selectedIds?.has(img.id)
        return (
          <div
            key={img.id}
            className="grid-item"
            style={{
              position: 'relative',
              borderRadius: rounded ? 8 : 0,
              overflow: 'hidden',
              // Clip every tile in the row to the SAME aspect ratio (the
              // row's tallest), so all tiles share a flush bottom edge. The
              // image inside uses object-fit: cover to keep its centre crop
              // — better than leaving ragged trailing gaps that the non-
              // virtualized masonry would smooth out with column packing.
              aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : 'auto 3 / 2',
              minWidth: 0,
            }}
          >
            <SignedImg
              bucket={imgBucket}
              path={img.storage_path || img.thumbnail_path}
              transformWidths={[320, 640, 960, 1280]}
              transformQuality={70}
              sizes={imgSizes}
              alt=""
              // Above-the-fold rows skip lazy + bump priority so the LCP
              // image lands in the first paint cycle.
              loading={eager ? 'eager' : 'lazy'}
              {...(eager ? { fetchpriority: 'high' as const } : {})}
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'cover',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,.05))',
                transition: 'opacity .35s ease, filter .3s ease',
                opacity: selectMode && !isSelected ? 0.55 : (clientMode && hiddenIds?.has(img.id)) ? 0.3 : 1,
                filter: selectMode && !isSelected ? 'saturate(0.6)' : 'none',
              }}
              onClick={() => (selectMode ? onToggleSelect?.(img.id) : onImageClick(index))}
            />
            {selectMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSelect?.(img.id)
                }}
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,.5)',
                  background: isSelected ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'rgba(0,0,0,.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                  transform: isSelected ? 'scale(1)' : 'scale(0.9)',
                  boxShadow: isSelected ? '0 2px 12px rgba(99,102,241,.4)' : '0 2px 8px rgba(0,0,0,.3)',
                }}
              >
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )}
            {clientMode && onToggleHide && (
              <button
                className="grid-item__dl"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleHide(img.id)
                }}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: hiddenIds?.has(img.id) ? '1.5px solid rgba(239,68,68,.4)' : '1px solid rgba(255,255,255,.1)',
                  background: hiddenIds?.has(img.id) ? 'rgba(239,68,68,.75)' : 'rgba(0,0,0,.45)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: hiddenIds?.has(img.id) ? 1 : undefined,
                  transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                  boxShadow: hiddenIds?.has(img.id) ? '0 2px 10px rgba(239,68,68,.3)' : '0 2px 8px rgba(0,0,0,.2)',
                }}
              >
                {hiddenIds?.has(img.id) ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            )}
            {!selectMode && onDownload && (
              <button
                className="grid-item__dl"
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(img)
                }}
                style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,.1)',
                  background: 'rgba(0,0,0,.45)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                  boxShadow: '0 2px 8px rgba(0,0,0,.25)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            {watermark?.text && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  ...(watermark.position === 'bottom-left'
                    ? { bottom: 8, left: 8 }
                    : watermark.position === 'top-right'
                      ? { top: 8, right: 8 }
                      : watermark.position === 'top-left'
                        ? { top: 8, left: 8 }
                        : watermark.position === 'center'
                          ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                          : { bottom: 8, right: 8 }),
                  color: 'rgba(255,255,255,.75)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textShadow: '0 1px 4px rgba(0,0,0,.6)',
                  maxWidth: '60%',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {watermark.text}
              </div>
            )}
          </div>
        )
      })}
      {children}
    </div>
  )
})

/** Compute the row height (in CSS pixels) for a given slice of images, when
 *  each row spans `containerWidth` divided across `cols` (minus gaps). The
 *  row height = (column width) × (tallest aspect-ratio h/w in the slice).
 *  Used by VariableSizeList to allocate the correct slot per row. */
export function rowHeightFor(
  rowImages: Array<{ img: GalleryImage; index: number }>,
  cols: number,
  containerWidth: number,
  gap: number,
): number {
  if (cols <= 0 || containerWidth <= 0) return 0
  const colWidth = (containerWidth - gap * (cols - 1)) / cols
  let maxRatio = 0
  for (const { img } of rowImages) {
    const ratio = img.width && img.height ? img.height / img.width : 2 / 3
    if (ratio > maxRatio) maxRatio = ratio
  }
  // +gap so each row owns the inter-row gap as bottom padding; matches the
  // paddingBottom in the row's grid container.
  return Math.ceil(colWidth * maxRatio) + gap
}
