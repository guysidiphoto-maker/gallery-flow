import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSocial } from '../store/social'
import { useGallery } from '../store/gallery'
import type { SocialPost, SplitLayout } from '../types'
import { toLocalURL } from '../utils/imageUtils'

// ── Helpers ────────────────────────────────────────────────────────────────────

const SPLIT_LAYOUTS: { value: SplitLayout; label: string; cols: number; rows: number }[] = [
  { value: '2h', label: '2 side by side', cols: 2, rows: 1 },
  { value: '3h', label: '3 horizontal', cols: 3, rows: 1 },
  { value: '2v', label: '2 stacked', cols: 1, rows: 2 },
  { value: '4',  label: '4 grid (2×2)', cols: 2, rows: 2 },
  { value: '6',  label: '6 grid (3×2)', cols: 3, rows: 2 },
  { value: '9',  label: '9 grid (3×3)', cols: 3, rows: 3 },
]

function splitTileCount(layout: SplitLayout): number {
  const def = SPLIT_LAYOUTS.find(l => l.value === layout)
  return def ? def.cols * def.rows : 2
}

// ── Grid Cell ──────────────────────────────────────────────────────────────────

function GridCell({
  post,
  index,
  imageUrl,
  isLocked,
  onAction
}: {
  post: SocialPost
  index: number
  imageUrl: string
  isLocked: boolean
  onAction: (action: 'split' | 'carousel' | 'revert' | 'ungroup' | 'crop' | 'lock', postId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id })
  const { cropStates } = useSocial()
  const [showMenu, setShowMenu] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1
  }

  const getSplitTilePos = useCallback((p: SocialPost): { cols: number; rows: number; col: number; row: number } | null => {
    if (p.type !== 'split-tile' || !p.splitLayout || p.splitTileIndex === undefined) return null
    const layout = SPLIT_LAYOUTS.find(l => l.value === p.splitLayout)
    if (!layout) return null
    return {
      cols: layout.cols,
      rows: layout.rows,
      col: p.splitTileIndex % layout.cols,
      row: Math.floor(p.splitTileIndex / layout.cols),
    }
  }, [])

  const gridPos = index + 1
  const isCarousel = post.type === 'carousel'
  const isSplitTile = post.type === 'split-tile'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`social-cell ${isSplitTile ? 'social-cell--split' : ''} ${isCarousel ? 'social-cell--carousel' : ''} ${isLocked ? 'social-cell--locked' : ''}`}
      {...attributes}
    >
      <div className="social-cell__inner" {...(isLocked ? {} : listeners)}>
        {imageUrl ? (() => {
          const tilePos = getSplitTilePos(post)
          if (tilePos) {
            return (
              <div className="social-cell__split-viewport">
                <div
                  className="social-cell__split-canvas"
                  style={{
                    width: `${tilePos.cols * 100}%`,
                    height: `${tilePos.rows * 100}%`,
                    left: `${-tilePos.col * 100}%`,
                    top: `${-tilePos.row * 100}%`,
                  }}
                >
                  <img src={imageUrl} alt="" draggable={false} />
                </div>
              </div>
            )
          }
          return <img src={imageUrl} alt="" className="social-cell__img" />
        })() : (
          <div className="social-cell__placeholder">?</div>
        )}

        {/* Overlays */}
        {isCarousel && (
          <div className="social-cell__type-badge social-cell__type-badge--carousel">
            ◫ {post.imageIds.length}
          </div>
        )}
        {isSplitTile && (
          <div className="social-cell__type-badge social-cell__type-badge--split">
            ⊞ {(post.splitTileIndex ?? 0) + 1}/{post.splitTotalTiles}
          </div>
        )}

        <div className="social-cell__num">{gridPos}</div>
        {cropStates[post.id] && (
          <div className="social-cell__crop-badge" title="Custom crop applied">✂</div>
        )}
        {isLocked && (
          <div className="social-cell__lock-badge" title="Position locked">⊠</div>
        )}
      </div>

      {/* Action menu */}
      <button
        className="social-cell__menu-btn"
        onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
      >
        ⋯
      </button>
      {showMenu && (
        <>
          <div className="dropdown__overlay" onClick={() => setShowMenu(false)} />
          <div className="social-cell__menu">
            {post.type === 'single' && (
              <>
                <button onClick={() => { setShowMenu(false); onAction('crop', post.id) }}>
                  Adjust Crop…
                </button>
                <button onClick={() => { setShowMenu(false); onAction('split', post.id) }}>
                  Split across grid…
                </button>
                <button onClick={() => { setShowMenu(false); onAction('carousel', post.id) }}>
                  Group as Carousel…
                </button>
              </>
            )}
            {post.type === 'carousel' && (
              <button onClick={() => { setShowMenu(false); onAction('ungroup', post.id) }}>
                Ungroup Carousel
              </button>
            )}
            {post.type === 'split-tile' && (
              <button onClick={() => { setShowMenu(false); onAction('revert', post.splitGroupId ?? '') }}>
                Revert Split to Single
              </button>
            )}
            <button onClick={() => { setShowMenu(false); onAction('lock', post.id) }}>
              {isLocked ? '🔓 Unlock Position' : '🔒 Lock Position'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Crop Adjuster ──────────────────────────────────────────────────────────────

const FRAME_SIZE = 360

function CropAdjuster() {
  const { cropAdjustPostId, cropStates, saveCropState, closeCropAdjust, posts } = useSocial()
  const { images } = useGallery()

  const post = posts.find(p => p.id === cropAdjustPostId)
  const img = images.find(i => post?.imageIds.includes(i.id))
  const imageUrl = img ? toLocalURL(img.path) : ''

  const existing = cropAdjustPostId ? cropStates[cropAdjustPostId] : null
  const [panX, setPanX] = useState(existing?.panX ?? 0)
  const [panY, setPanY] = useState(existing?.panY ?? 0)
  const [zoom, setZoom] = useState(existing?.zoom ?? 1.0)

  const [imgNaturalW, setImgNaturalW] = useState(1)
  const [imgNaturalH, setImgNaturalH] = useState(1)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement>(null)

  if (!cropAdjustPostId || !imageUrl) return null

  // Cover scale: scale image to fill FRAME_SIZE × FRAME_SIZE
  const coverScale = Math.max(FRAME_SIZE / imgNaturalW, FRAME_SIZE / imgNaturalH)
  const cssW = imgNaturalW * coverScale * zoom
  const cssH = imgNaturalH * coverScale * zoom
  const maxPanX = Math.max(0, (cssW - FRAME_SIZE) / 2)
  const maxPanY = Math.max(0, (cssH - FRAME_SIZE) / 2)
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panX))
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panY))

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setPanX(prev => Math.max(-maxPanX, Math.min(maxPanX, prev + dx)))
    setPanY(prev => Math.max(-maxPanY, Math.min(maxPanY, prev + dy)))
  }

  const handlePointerUp = () => { isDragging.current = false }

  const handleConfirm = () => {
    if (cropAdjustPostId) {
      saveCropState(cropAdjustPostId, { panX: clampedPanX, panY: clampedPanY, zoom })
    }
    closeCropAdjust()
  }

  const handleReset = () => { setPanX(0); setPanY(0); setZoom(1.0) }

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    // Re-clamp pan when zoom changes
    const newCoverScale = Math.max(FRAME_SIZE / imgNaturalW, FRAME_SIZE / imgNaturalH)
    const newCssW = imgNaturalW * newCoverScale * newZoom
    const newCssH = imgNaturalH * newCoverScale * newZoom
    const newMaxPanX = Math.max(0, (newCssW - FRAME_SIZE) / 2)
    const newMaxPanY = Math.max(0, (newCssH - FRAME_SIZE) / 2)
    setPanX(prev => Math.max(-newMaxPanX, Math.min(newMaxPanX, prev)))
    setPanY(prev => Math.max(-newMaxPanY, Math.min(newMaxPanY, prev)))
  }

  return (
    <div className="crop-adjuster-overlay">
      <div className="crop-adjuster">
        <div className="crop-adjuster__header">
          <h3>Adjust Crop</h3>
          <p className="crop-adjuster__hint">Drag to reposition · Zoom to adjust</p>
        </div>

        <div
          ref={frameRef}
          className="crop-adjuster__frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <img
            src={imageUrl}
            alt=""
            className="crop-adjuster__image"
            style={{
              width: cssW,
              height: cssH,
              left: (FRAME_SIZE - cssW) / 2 + clampedPanX,
              top: (FRAME_SIZE - cssH) / 2 + clampedPanY,
            }}
            onLoad={e => {
              const el = e.currentTarget
              setImgNaturalW(el.naturalWidth)
              setImgNaturalH(el.naturalHeight)
            }}
            draggable={false}
          />
          <div className="crop-adjuster__frame-border" />
        </div>

        <div className="crop-adjuster__zoom">
          <span className="crop-adjuster__zoom-label">Zoom</span>
          <input
            type="range"
            min={1.0}
            max={2.0}
            step={0.01}
            value={zoom}
            onChange={e => handleZoomChange(Number(e.target.value))}
            className="crop-adjuster__slider"
          />
          <span className="crop-adjuster__zoom-val">{zoom.toFixed(2)}×</span>
        </div>

        <div className="crop-adjuster__footer">
          <button className="btn btn--ghost" onClick={handleReset}>Reset</button>
          <button className="btn btn--ghost" onClick={closeCropAdjust}>Cancel</button>
          <button className="btn btn--accent" onClick={handleConfirm}>Apply Crop</button>
        </div>
      </div>
    </div>
  )
}

// ── Split Builder ──────────────────────────────────────────────────────────────

function SplitBuilder({ imageUrl }: { imageUrl: string }) {
  const { splitSelectedLayout, setSplitLayout, confirmSplit, setScreen } = useSocial()
  const layout = SPLIT_LAYOUTS.find(l => l.value === splitSelectedLayout) ?? SPLIT_LAYOUTS[0]

  return (
    <div className="social-split-builder">
      <div className="social-split-builder__preview">
        <div
          className="social-split-builder__grid"
          style={{ '--cols': layout.cols, '--rows': layout.rows } as React.CSSProperties}
        >
          {Array.from({ length: layout.cols * layout.rows }, (_, i) => {
            const col = i % layout.cols
            const row = Math.floor(i / layout.cols)
            return (
              <div key={i} className="social-split-builder__tile">
                <div
                  className="social-split-builder__tile-canvas"
                  style={{
                    width: `${layout.cols * 100}%`,
                    height: `${layout.rows * 100}%`,
                    left: `${-col * 100}%`,
                    top: `${-row * 100}%`,
                  }}
                >
                  <img src={imageUrl} alt="" draggable={false} />
                </div>
                <div className="social-split-builder__tile-num">{i + 1}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="social-split-builder__options">
        <div className="social-option-label">Split Layout</div>
        <div className="social-layout-grid">
          {SPLIT_LAYOUTS.map(l => (
            <button
              key={l.value}
              className={`social-layout-btn ${splitSelectedLayout === l.value ? 'active' : ''}`}
              onClick={() => setSplitLayout(l.value)}
            >
              <div className="social-layout-btn__icon" style={{ '--cols': l.cols, '--rows': l.rows } as React.CSSProperties}>
                {Array.from({ length: l.cols * l.rows }, (_, i) => <div key={i} />)}
              </div>
              <span>{l.label}</span>
            </button>
          ))}
        </div>

        <div className="social-split-builder__hint">
          This will create {splitTileCount(splitSelectedLayout)} separate grid posts from one image.
          Post them in reverse tile order to create the panoramic effect.
        </div>

        <div className="social-split-builder__actions">
          <button className="btn btn--ghost" onClick={() => setScreen('grid')}>← Cancel</button>
          <button className="btn btn--accent" onClick={confirmSplit}>
            Create {splitTileCount(splitSelectedLayout)} Tiles →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Carousel Builder ───────────────────────────────────────────────────────────

function CarouselBuilder() {
  const { carouselSelectedIds, toggleCarouselImage, confirmCarousel, setScreen } = useSocial()
  const { images, topPickIds } = useGallery()
  const pickImages = images.filter(img => topPickIds.has(img.id))

  return (
    <div className="social-carousel-builder">
      <p className="social-carousel-builder__hint">
        Select images to include in this carousel post (2–10 images).
      </p>
      <div className="social-carousel-builder__grid">
        {pickImages.map(img => {
          const selected = carouselSelectedIds.includes(img.id)
          return (
            <button
              key={img.id}
              className={`social-carousel-thumb ${selected ? 'active' : ''}`}
              onClick={() => toggleCarouselImage(img.id)}
            >
              <img src={toLocalURL(img.path)} alt="" />
              {selected && <div className="social-carousel-thumb__check">✓</div>}
            </button>
          )
        })}
      </div>
      <div className="social-carousel-builder__footer">
        <button className="btn btn--ghost" onClick={() => setScreen('grid')}>← Cancel</button>
        <button
          className="btn btn--accent"
          onClick={confirmCarousel}
          disabled={carouselSelectedIds.length < 2}
        >
          Group {carouselSelectedIds.length} Images as Carousel →
        </button>
      </div>
    </div>
  )
}

// ── Posting Assistant ──────────────────────────────────────────────────────────

function PostingAssistant() {
  const { posts } = useSocial()
  const { images } = useGallery()
  const imgMap = new Map(images.map(img => [img.id, img]))

  // Posting order is reversed (post last grid item first)
  const postingOrder = [...posts].reverse()

  return (
    <div className="social-assistant">
      <div className="social-assistant__intro">
        <div className="social-assistant__intro-icon">📱</div>
        <div>
          <p className="social-assistant__intro-title">Post in this order</p>
          <p className="social-assistant__intro-sub">
            Start from the bottom of your grid and work up. The first post you make will appear in the bottom-right of your Instagram grid.
          </p>
        </div>
      </div>

      <div className="social-assistant__list">
        {postingOrder.map((post, orderIdx) => {
          const originalIdx = posts.length - 1 - orderIdx
          const img = imgMap.get(post.imageIds[0])
          const url = img ? toLocalURL(img.path) : ''
          const postNum = originalIdx + 1

          return (
            <div key={post.id} className="social-assistant__item">
              <div className="social-assistant__step">{orderIdx + 1}</div>
              <div className="social-assistant__thumb">
                {url && <img src={url} alt="" />}
              </div>
              <div className="social-assistant__info">
                <span className="social-assistant__file">post_{String(postNum).padStart(2, '0')}</span>
                {post.type === 'carousel' && (
                  <span className="social-assistant__tag social-assistant__tag--carousel">
                    Carousel · {post.imageIds.length} slides
                  </span>
                )}
                {post.type === 'split-tile' && (
                  <span className="social-assistant__tag social-assistant__tag--split">
                    Split tile {(post.splitTileIndex ?? 0) + 1}/{post.splitTotalTiles}
                  </span>
                )}
              </div>
              <div className="social-assistant__grid-pos">
                Grid #{postNum}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Handoff / Export ───────────────────────────────────────────────────────────

function Handoff() {
  const {
    exportDir, exportProgress, exportStage, isExporting, exportDone, exportError,
    includeOrderOverlay, setIncludeOrderOverlay, posts
  } = useSocial()

  const handleCopyPath = () => {
    if (exportDir) navigator.clipboard.writeText(exportDir)
  }

  if (!isExporting && !exportDone && !exportError) {
    return (
      <div className="social-handoff">
        <div className="social-handoff__options">
          <label className="social-handoff__option">
            <input
              type="checkbox"
              checked={includeOrderOverlay}
              onChange={e => setIncludeOrderOverlay(e.target.checked)}
            />
            <div>
              <span className="social-handoff__option-title">Include order number on images</span>
              <span className="social-handoff__option-sub">Adds "POST 1 OF 5" label on each image — helpful when viewing on iPhone</span>
            </div>
          </label>
        </div>
        <div className="social-handoff__idle-note">
          Export will create:
          <ul>
            <li>post_01.jpg through post_{String(posts.length).padStart(2, '0')}.jpg (in visual grid order)</li>
            <li>00_POSTING_GUIDE.jpg — visual guide showing upload order</li>
          </ul>
          Post files in <strong>reverse order</strong> (post_{String(posts.length).padStart(2, '0')} first → post_01 last).
        </div>
      </div>
    )
  }

  return (
    <div className="social-handoff">
      {isExporting && (
        <div className="social-handoff__exporting">
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <p className="social-handoff__stage">{exportStage}</p>
          <div className="progress-bar" style={{ width: 280 }}>
            <div className="progress-bar__fill" style={{ width: `${exportProgress}%` }} />
          </div>
          <p className="social-handoff__pct">{exportProgress}%</p>
        </div>
      )}

      {exportDone && exportDir && (
        <div className="social-handoff__done">
          <div className="social-handoff__done-icon">✓</div>
          <p className="social-handoff__done-title">Export complete!</p>
          <p className="social-handoff__done-dir" title={exportDir}>{exportDir}</p>

          <div className="social-handoff__actions">
            <button className="btn btn--accent" onClick={() => window.api.revealInFinder(exportDir)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Reveal in Finder
            </button>
            <button className="btn btn--ghost" onClick={handleCopyPath}>
              Copy Path
            </button>
          </div>

          <div className="social-handoff__airdrop">
            <div className="social-handoff__airdrop-title">AirDrop to iPhone</div>
            <ol className="social-handoff__airdrop-steps">
              <li>Open the export folder in Finder</li>
              <li>Select all files (⌘A)</li>
              <li>Right-click → Share → AirDrop</li>
              <li>Select your iPhone</li>
              <li>Post files in reverse order (highest number first)</li>
            </ol>
          </div>
        </div>
      )}

      {exportError && (
        <div className="social-handoff__error">
          <div className="social-handoff__error-icon">⚠</div>
          <p className="social-handoff__error-title">Export failed</p>
          <p className="social-handoff__error-msg">{exportError}</p>
        </div>
      )}

    </div>
  )
}

// ── Main SocialMode ────────────────────────────────────────────────────────────

export function SocialMode() {
  const {
    isOpen, screen, posts,
    splitTargetId, closeSocial, setScreen,
    initFromPicks, reorderPosts,
    startSplitBuilder, revertToSingle,
    startCarouselBuilder, ungroupCarousel,
    exportPackage, startCropAdjust,
    lockedPostIds, toggleLockPost
  } = useSocial()
  const { images, topPickIds } = useGallery()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Init posts from gallery top picks on open
  useEffect(() => {
    if (isOpen && posts.length === 0 && topPickIds.size > 0) {
      initFromPicks(images, topPickIds)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSocial() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeSocial])

  // Subscribe to export progress
  useEffect(() => {
    if (!isOpen) return
    const unsub = window.api.onSocialExportProgress(({ percent, stage }) => {
      useSocial.setState({ exportProgress: percent, exportStage: stage })
    })
    return unsub
  }, [isOpen])

  if (!isOpen) return null

  // Build imageId → image map
  const imgMap = new Map(images.map(img => [img.id, img]))

  // Build imageId → path map for export
  const imagePathMap = new Map(images.map(img => [img.id, img.path]))

  const getPostImageUrl = (post: SocialPost) => {
    const img = imgMap.get(post.imageIds[0])
    return img ? toLocalURL(img.path) : ''
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const fromIdx = posts.findIndex(p => p.id === active.id)
    const toIdx = posts.findIndex(p => p.id === over.id)
    if (fromIdx >= 0 && toIdx >= 0) reorderPosts(fromIdx, toIdx)
  }

  const handleCellAction = (action: 'split' | 'carousel' | 'revert' | 'ungroup' | 'crop' | 'lock', id: string) => {
    if (action === 'split') startSplitBuilder(id)
    else if (action === 'carousel') startCarouselBuilder(id)
    else if (action === 'revert') revertToSingle(id)
    else if (action === 'ungroup') ungroupCarousel(id)
    else if (action === 'crop') startCropAdjust(id)
    else if (action === 'lock') toggleLockPost(id)
  }

  const splitTargetPost = splitTargetId ? posts.find(p => p.id === splitTargetId) : null
  const splitTargetUrl = splitTargetPost ? getPostImageUrl(splitTargetPost) : ''

  const TABS: { key: typeof screen; label: string }[] = [
    { key: 'grid', label: 'Grid' },
    { key: 'posting-assistant', label: 'Posting Order' },
    { key: 'handoff', label: 'Export & Send' },
  ]

  return (
    <div className="social-overlay">
      {/* Header */}
      <div className="social-header">
        <div className="social-header__left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          <span className="social-header__title">Instagram Mode</span>
          <span className="social-header__count">{posts.length} posts</span>
        </div>

        <nav className="social-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`social-tab ${screen === tab.key ? 'active' : ''}`}
              onClick={() => setScreen(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="social-header__right">
          <button
            className="btn btn--accent"
            onClick={() => exportPackage(imagePathMap)}
            disabled={posts.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Package
          </button>
          <button className="social-header__close" onClick={closeSocial}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="social-body">
        {/* Grid screen */}
        {screen === 'grid' && (
          <div className="social-grid-wrap">
            <div className="social-grid-info">
              <span>{posts.length} posts · 3-column Instagram grid</span>
              <span className="social-grid-hint">Drag to reorder · Click ⋯ for options</span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={posts.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className="social-grid">
                  {posts.map((post, i) => (
                    <GridCell
                      key={post.id}
                      post={post}
                      index={i}
                      imageUrl={getPostImageUrl(post)}
                      isLocked={lockedPostIds.has(post.id)}
                      onAction={handleCellAction}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {posts.length === 0 && (
              <div className="social-grid-empty">
                <p>No top picks selected.</p>
                <p className="social-grid-empty__sub">Press T on images in the gallery to mark top picks.</p>
              </div>
            )}
          </div>
        )}

        {/* Split builder */}
        {screen === 'split-builder' && (
          <SplitBuilder imageUrl={splitTargetUrl} />
        )}

        {/* Carousel builder */}
        {screen === 'carousel-builder' && <CarouselBuilder />}

        {/* Posting assistant */}
        {screen === 'posting-assistant' && <PostingAssistant />}

        {/* Handoff / Export */}
        {screen === 'handoff' && <Handoff />}
      </div>
      <CropAdjuster />
    </div>
  )
}
