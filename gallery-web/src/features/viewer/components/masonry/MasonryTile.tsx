import { SignedImg } from '@/shared/ui/SignedImg'
import { cn } from '@/shared/ui'
import type { GalleryImage } from '@/shared/types'
import { DownloadIcon } from '../DownloadIcon'

export interface TileWatermark { text: string; position: string }

const WATERMARK_POSITION: Record<string, string> = {
  'bottom-left': 'bottom-2 left-2',
  'top-right': 'top-2 right-2',
  'top-left': 'top-2 left-2',
  center: 'top-1/2 left-1/2 -translate-1/2',
}

const roundBtn =
  'absolute flex items-center justify-center rounded-full transition-all duration-250 ease-[cubic-bezier(.16,1,.3,1)]'

export function MasonryTile({
  img, index, imgBucket, imgSizes, fullWidth, isAboveFold, rounded,
  selectMode, isSelected, clientMode, isHidden, watermark,
  onImageClick, onToggleSelect, onToggleHide, onDownload, onWarmDownload,
}: {
  img: GalleryImage
  index: number
  imgBucket: string
  imgSizes: string
  /** One-column layout: the tile spans the page, so the 2048px web copy may be picked. */
  fullWidth: boolean
  /** First-row tiles are the LCP: eager + high fetch priority. */
  isAboveFold: boolean
  rounded: boolean
  selectMode?: boolean
  isSelected: boolean
  clientMode?: boolean
  isHidden: boolean
  watermark?: TileWatermark | null
  onImageClick: (index: number) => void
  onToggleSelect?: (id: string) => void
  onToggleHide?: (id: string) => void
  onDownload?: (img: GalleryImage) => void
  onWarmDownload?: (img: GalleryImage) => void
}) {
  const activate = () => (selectMode ? onToggleSelect?.(img.id) : onImageClick(index))

  return (
    <div
      className={cn(
        'group relative overflow-hidden [contain-intrinsic-size:auto_320px] [content-visibility:auto]',
        // Hover lift only where hover is real: per-tile compositor work crashed mobile Safari on fast scroll.
        '[@media(hover:hover)]:[transition:translate_.35s_cubic-bezier(.16,1,.3,1),scale_.35s_cubic-bezier(.16,1,.3,1),box-shadow_.35s_ease]',
        'hover:-translate-y-0.5 hover:scale-[1.008] hover:shadow-[0_12px_36px_-8px] hover:shadow-black/45',
        rounded && 'rounded-[8px]',
      )}
    >
      <SignedImg
        bucket={imgBucket}
        // Grid tiles use the 640px thumb; the 2048px web copy is for the lightbox. Only a
        // one-column layout is wide enough that a thumb would look soft.
        path={img.thumbnail_path || img.storage_path}
        srcSetPaths={[
          { path: img.thumbnail_path, width: 640 },
          ...(fullWidth ? [{ path: img.storage_path, width: 2048 }] : []),
        ]}
        sizes={imgSizes}
        alt=""
        loading={isAboveFold ? 'eager' : 'lazy'}
        // Lowercase: React 18 warns on (and doesn't map) the camelCase prop.
        {...(isAboveFold ? { fetchpriority: 'high' } : {})}
        decoding="async"
        className={cn(
          'gv-tile-placeholder block h-auto w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white [transition:opacity_.35s_ease,filter_.3s_ease]',
          selectMode && !isSelected ? 'opacity-55 saturate-60' : clientMode && isHidden ? 'opacity-30' : 'opacity-100',
        )}
        // Reserve the tile's space before load (real ratio, else 3:2) so columns never collapse.
        style={{ aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : 'auto 3 / 2' }}
        onClick={activate}
        // Keyboard access: tiles act as buttons (Enter/Space opens or toggles).
        role="button"
        tabIndex={0}
        aria-label={selectMode ? `בחירת תמונה ${index + 1}` : `פתיחת תמונה ${index + 1}`}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } }}
      />
      {selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect?.(img.id) }}
          className={cn(
            roundBtn, 'start-2.5 top-2.5 size-7 border-2 backdrop-blur-[8px]',
            isSelected
              ? 'scale-100 border-brand-soft bg-linear-135/srgb from-brand to-brand-soft shadow-[0_2px_12px] shadow-brand/40'
              : 'scale-90 border-white/50 bg-black/40 shadow-[0_2px_8px] shadow-black/30',
          )}
        >
          {isSelected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"/></svg>}
        </button>
      )}
      {clientMode && onToggleHide && (
        <button
          onClick={e => { e.stopPropagation(); onToggleHide(img.id) }}
          className={cn(
            roundBtn, 'end-2.5 top-2.5 size-[34px] text-white backdrop-blur-[12px]',
            isHidden
              ? 'border-[1.5px] border-(--viewer-danger)/40 bg-(--viewer-danger)/75 opacity-100 shadow-[0_2px_10px] shadow-(--viewer-danger)/30'
              : 'border border-white/10 bg-black/45 shadow-[0_2px_8px] shadow-black/20',
          )}
        >
          {isHidden ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      )}
      {!selectMode && onDownload && (
        <button
          // Warm the File the moment the finger lands so the first tap can open the share sheet.
          onPointerDown={() => onWarmDownload?.(img)}
          onClick={e => { e.stopPropagation(); onDownload(img) }}
          className={cn(
            roundBtn, 'end-2.5 bottom-2.5 size-[34px] border border-white/10 bg-black/45 text-white opacity-0 shadow-[0_2px_8px] shadow-black/25 backdrop-blur-[12px]',
            // Plain :hover (not hover-media gated) so a tap reveals it on touch devices too.
            '[.group:hover_&]:opacity-100 hover:border-brand/50 hover:bg-brand/70',
          )}
        >
          <DownloadIcon size={14} strokeWidth={2} />
        </button>
      )}
      {/* Presentation-only watermark on previews; downloads are unaffected. */}
      {watermark?.text && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute max-w-[60%] truncate text-[10px] font-semibold tracking-[0.04em] text-white/75',
            'text-shadow-[0_1px_4px_var(--color-black)]/60',
            WATERMARK_POSITION[watermark.position] ?? 'right-2 bottom-2',
          )}
        >
          {watermark.text}
        </div>
      )}
    </div>
  )
}
