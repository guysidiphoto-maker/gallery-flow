import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react'
import JSZip from 'jszip'
import { supabase, storageUrl } from './supabase'
import { ensurePublicSession, isPublicViewerSignedUrlsEnabled, readPublicSessionToken } from './lib/publicSession'
import { signedStorageUrl } from './lib/signedStorage'
import { TurnstileWidget } from './components/TurnstileWidget'
import { SignedImg } from './components/SignedImg'
import type { Gallery, GalleryImage, GallerySection, Story, DeliverySettings } from './types'
import { Viewer } from './Viewer'
import { PasswordGate, isGalleryUnlocked } from './PasswordGate'
import { FaceSearchExperience } from './components/FaceSearchExperience'
import { StoryPlayer } from './components/StoryPlayer'
import { t, type Lang } from './i18n'
import {
  getMeta as gcGetMeta,
  getImages as gcGetImages,
  getStories as gcGetStories,
  getHidden as gcGetHidden,
  setHidden as gcSetHidden,
} from './lib/galleryClient'
import { logDownload, logBatchDownload, toggleFavorite as apiToggleFavorite } from './lib/activityLog'

// ─── Scroll reveal wrapper — 3D parallax on each image ─────────────────────

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mobile = window.innerWidth < 768
    const strength = mobile ? 1 : 0.5
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20)
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const ratio = entry.intersectionRatio
      const isAbove = entry.boundingClientRect.top + entry.boundingClientRect.height / 2 < window.innerHeight / 2
      const abs = 1 - ratio
      const opacity = Math.max(0.15, 1 - abs * 0.85 * strength)
      const rotateX = (isAbove ? 1 : -1) * abs * 5 * strength
      const scale = 1 + 0.03 * strength - abs * 0.1 * strength
      const translateY = (isAbove ? -1 : 1) * abs * 20 * strength
      el.style.opacity = `${opacity}`
      el.style.transform = `perspective(600px) rotateX(${rotateX}deg) scale(${scale}) translateY(${translateY}px)`
    }, { threshold: thresholds })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} style={{ willChange: 'opacity, transform', transformStyle: 'preserve-3d' }}>{children}</div>
}

// ─── Order-preserving Masonry Grid ──────────────────────────────────────────

function useColumnCount(layoutMode: string): number {
  const [cols, setCols] = useState(2)
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth
      if (layoutMode === '1-col') { setCols(1); return }
      const base = layoutMode === '3-col' ? 3 : 2
      if (w < 480) setCols(Math.min(base, 2))
      else if (w < 768) setCols(base)
      else if (w < 1100) setCols(base + 1)
      else setCols(base + 2)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [layoutMode])
  return cols
}

function MasonryGrid({ images, imgBucket, layoutMode, imageSpacing, cornerStyle, onImageClick, onDownload, selectMode, selectedIds, onToggleSelect, clientMode, hiddenIds, onToggleHide, favoritedIds, onToggleFavorite, watermark }: {
  images: GalleryImage[]
  /** Storage bucket the thumbnails live in. The component picks the path
   *  per image (thumbnail_path with web fallback) and routes through
   *  SignedImg, which signs/short-circuits based on the feature flag. */
  imgBucket: string
  layoutMode: string
  imageSpacing: string
  cornerStyle: string
  onImageClick: (index: number) => void
  onDownload?: (img: GalleryImage) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  clientMode?: boolean
  hiddenIds?: Set<string>
  onToggleHide?: (id: string) => void
  favoritedIds?: Set<string>
  onToggleFavorite?: (id: string) => void
  watermark?: { text: string; position: string } | null
}) {
  const cols = useColumnCount(layoutMode)
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map())

  // Progressive render: keep at most this many photos in the DOM at once.
  // Even with content-visibility, mobile Safari OOMs at ~500+ tiles when
  // the user flings the scroll. Render the first batch, then reveal more
  // as a sentinel near the bottom comes into view.
  const BATCH_SIZE = 150
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // When `images` shrinks (e.g. face-search filter applied), don't keep
  // a stale large visibleCount — clamp it back to the new total.
  useEffect(() => {
    setVisibleCount(prev => Math.min(Math.max(BATCH_SIZE, prev), images.length))
  }, [images.length])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (visibleCount >= images.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(c => Math.min(c + BATCH_SIZE, images.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, images.length])
  const visibleImages = useMemo(() => images.slice(0, visibleCount), [images, visibleCount])

  // Round-robin column distribution: image 0 → col 0, image 1 → col 1, …
  //
  // The earlier shortest-column algorithm depended on each image's loaded
  // aspect ratio, so as lazy-loaded images came in the layout reshuffled
  // mid-scroll — photos visibly jumped between columns. Round-robin places
  // every image once on first render and never moves it. Columns may end
  // up slightly uneven in height, but the gallery stops "dancing" when
  // a client opens a section.
  const columns = useMemo(() => {
    const result: Array<Array<{ img: GalleryImage; index: number }>> = Array.from({ length: cols }, () => [])
    for (let i = 0; i < visibleImages.length; i++) {
      result[i % cols].push({ img: visibleImages[i], index: i })
    }
    return result
  }, [visibleImages, cols])

  const handleLoad = useCallback((_index: number, _el: HTMLImageElement) => {
    // No-op: column placement is now position-based, so we no longer need
    // to track per-image natural ratios. Each <img height="auto"> still
    // stretches to its natural ratio inside its slot.
  }, [])

  const gap = imageSpacing === 'none' ? 0 : imageSpacing === 'medium' ? 10 : 4
  const rounded = cornerStyle === 'rounded'

  return (
    <div style={{
      display: 'flex',
      gap,
      padding: gap > 0 ? `0 ${gap}px` : 0,
      maxWidth: layoutMode === '1-col' ? 900 : undefined,
      margin: layoutMode === '1-col' ? '0 auto' : undefined,
      position: 'relative',
    }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap }}>
          {col.map(({ img, index }) => {
            const isSelected = selectMode && selectedIds?.has(img.id)
            const gridItem = (
              <div className="grid-item" style={{ position: 'relative', borderRadius: rounded ? 8 : 0, overflow: 'hidden' }}>
                <SignedImg
                  ref={el => { if (el) imgRefs.current.set(img.id, el) }}
                  bucket={imgBucket}
                  path={img.thumbnail_path || img.storage_path}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%', height: 'auto', display: 'block',
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,.05))',
                    transition: 'opacity .35s ease, transform .4s cubic-bezier(.16,1,.3,1), filter .3s ease',
                    opacity: selectMode && !isSelected ? 0.55 : (clientMode && hiddenIds?.has(img.id)) ? 0.3 : 1,
                    filter: selectMode && !isSelected ? 'saturate(0.6)' : 'none',
                  }}
                  onLoad={e => { handleLoad(index, e.currentTarget); e.currentTarget.style.animation = 'none' }}
                  onClick={() => selectMode ? onToggleSelect?.(img.id) : onImageClick(index)}
                />
                {/* Selection checkbox */}
                {selectMode && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleSelect?.(img.id) }}
                    style={{
                      position: 'absolute', top: 10, left: 10,
                      width: 28, height: 28, borderRadius: '50%',
                      border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,.5)',
                      background: isSelected ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'rgba(0,0,0,.4)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      transform: isSelected ? 'scale(1)' : 'scale(0.9)',
                      boxShadow: isSelected ? '0 2px 12px rgba(99,102,241,.4)' : '0 2px 8px rgba(0,0,0,.3)',
                    }}
                  >
                    {isSelected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                )}
                {/* Client hide/unhide button */}
                {clientMode && onToggleHide && (
                  <button
                    className="grid-item__dl"
                    onClick={e => { e.stopPropagation(); onToggleHide(img.id) }}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 34, height: 34, borderRadius: '50%',
                      border: hiddenIds?.has(img.id) ? '1.5px solid rgba(239,68,68,.4)' : '1px solid rgba(255,255,255,.1)',
                      background: hiddenIds?.has(img.id) ? 'rgba(239,68,68,.75)' : 'rgba(0,0,0,.45)',
                      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: hiddenIds?.has(img.id) ? 1 : undefined,
                      transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      boxShadow: hiddenIds?.has(img.id) ? '0 2px 10px rgba(239,68,68,.3)' : '0 2px 8px rgba(0,0,0,.2)',
                    }}
                  >
                    {hiddenIds?.has(img.id) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                )}
                {/* Download button on hover */}
                {!selectMode && onDownload && (
                  <button
                    className="grid-item__dl"
                    onClick={e => { e.stopPropagation(); onDownload(img) }}
                    style={{
                      position: 'absolute', bottom: 10, right: 10,
                      width: 34, height: 34, borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,.1)',
                      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.7)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                )}
                {/* Heart / favorite — always visible when favorited; hover-revealed when not */}
                {!selectMode && onToggleFavorite && (
                  <button
                    className="grid-item__fav"
                    aria-label={favoritedIds?.has(img.id) ? 'Remove favorite' : 'Add favorite'}
                    onClick={e => { e.stopPropagation(); onToggleFavorite(img.id) }}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 34, height: 34, borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,.12)',
                      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: favoritedIds?.has(img.id) ? 1 : 0,
                      transition: 'all .18s cubic-bezier(.16,1,.3,1)',
                      boxShadow: favoritedIds?.has(img.id) ? '0 2px 12px rgba(239,68,68,.3)' : '0 2px 8px rgba(0,0,0,.25)',
                    }}
                    onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.85)' }}
                    onMouseUp={e => { e.currentTarget.style.transform = '' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = '' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24"
                      fill={favoritedIds?.has(img.id) ? '#ef4444' : 'none'}
                      stroke={favoritedIds?.has(img.id) ? '#ef4444' : '#fff'}
                      strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                )}
                {/* Watermark overlay — purely presentational; the original
                    download is unaffected. Only renders for previews. */}
                {watermark?.text && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute', pointerEvents: 'none',
                      ...(watermark.position === 'bottom-left'  ? { bottom: 8, left: 8 }
                        : watermark.position === 'top-right'    ? { top: 8, right: 8 }
                        : watermark.position === 'top-left'     ? { top: 8, left: 8 }
                        : watermark.position === 'center'       ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                        : { bottom: 8, right: 8 }),
                      color: 'rgba(255,255,255,.75)',
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                      textShadow: '0 1px 4px rgba(0,0,0,.6)',
                      maxWidth: '60%',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}
                  >
                    {watermark.text}
                  </div>
                )}
              </div>
            )
            // ScrollReveal previously wrapped every tile with a 21-threshold
            // IntersectionObserver + a 3D-perspective transform on a GPU
            // layer. With 150+ tiles that meant thousands of layout/paint
            // operations per scroll frame on mobile Safari and the tab
            // crashed on fast scroll. Render the bare grid item instead.
            return <Fragment key={img.id}>{gridItem}</Fragment>
          })}
        </div>
      ))}
      {/* Progressive-render sentinel: when this scrolls into view we reveal
          the next BATCH_SIZE photos. Sized so it never affects layout. */}
      {visibleCount < images.length && (
        <div
          ref={sentinelRef}
          aria-hidden
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({ style = 'mosaic', galleryTitle, galleryDescription, welcomeMessage, textAnimation = 'blur', animationSpeed = 'normal', eventDate, eventLocation, clientName, studioName, studioWebsite, images, storageUrl: getUrl, coverImageUrl, coverCrop, onEnter, faceSearchAvailable, facePrivacyMode, onFindMyPhotos, lang = 'he', headingFont, bodyFont }: {
  style?: 'mosaic' | 'cinematic' | 'minimal'
  galleryTitle: string
  galleryDescription?: string
  welcomeMessage?: string
  textAnimation?: 'blur' | 'typewriter' | 'slide'
  animationSpeed?: 'slow' | 'normal' | 'fast'
  eventDate?: string
  eventLocation?: string
  clientName: string
  studioName: string
  studioWebsite?: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  coverImageUrl?: string | null
  coverCrop?: { zoom: number; x: number; y: number } | null
  onEnter: () => void
  faceSearchAvailable: boolean
  facePrivacyMode: 'open' | 'private' | null
  onFindMyPhotos: () => void
  lang?: Lang
  // Photographer-chosen fonts from the Design tab. Applied to the heading
  // (h1) and supporting body text. Undefined = use the global stack.
  headingFont?: string
  bodyFont?: string
}) {
  const wsTxt = t(lang)
  // Initial render must already have animations applied. Otherwise the first
  // paint shows every element at its default style (opacity 1), then the
  // animation flips them to opacity 0 ("from" via fill-mode both), then they
  // fade back in — that's the visible flash. Starting `visible` true means
  // fill-mode both pins each element to opacity 0 during its start delay
  // from frame one.
  const [visible] = useState(true)
  const [entered, setEntered] = useState(false)

  const isPrivate = faceSearchAvailable && facePrivacyMode === 'private'
  const showFindButton = faceSearchAvailable && facePrivacyMode !== null
  const isMinimal = style === 'minimal'
  const isCinematic = style === 'cinematic'

  const handleEnter = () => {
    setEntered(true)
    setTimeout(onEnter, 600)
  }

  // ── Shared content overlay (all styles) ──
  const renderContent = () => (
    <div style={{
      position: 'relative', zIndex: 2, textAlign: 'center',
      padding: '0 24px', maxWidth: isMinimal ? 800 : 680,
    }}>
      {/* Studio name */}
      {studioName && (
        <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .3s both' : 'none' }}>
          {studioWebsite ? (
            <a href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.4)', margin: '0 0 20px', fontWeight: 500,
                textDecoration: 'none', transition: 'color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.8)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
              onClick={e => e.stopPropagation()}
            >{studioName}</a>
          ) : (
            <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', margin: '0 0 20px', fontWeight: 500 }}>
              {studioName}
            </p>
          )}
        </div>
      )}

      {/* Title */}
      <div style={{
        animation: visible
          ? (isCinematic ? 'wcReveal 1.4s cubic-bezier(.16,1,.3,1) .5s both'
            : isMinimal ? 'wcLetterSpace 1.2s cubic-bezier(.16,1,.3,1) .4s both'
            : 'wcFadeUp 1s cubic-bezier(.16,1,.3,1) .5s both')
          : 'none',
      }}>
        <h1 style={{
          fontSize: isMinimal ? 'clamp(40px, 9vw, 88px)' : 'clamp(32px, 7vw, 68px)',
          fontWeight: isMinimal ? 800 : 700, color: '#fff',
          margin: 0,
          lineHeight: isMinimal ? 1.02 : 1.08,
          letterSpacing: isMinimal ? '0.04em' : '-0.025em',
          textShadow: isCinematic ? '0 4px 60px rgba(0,0,0,.7)' : isMinimal ? 'none' : '0 2px 40px rgba(0,0,0,.5)',
          textTransform: isMinimal ? 'uppercase' : 'none',
          fontFamily: headingFont ? `'${headingFont}', inherit` : undefined,
        }}>{galleryTitle}</h1>
      </div>

      {/* Client name */}
      {clientName && (
        <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .65s both' : 'none' }}>
          <p style={{
            fontSize: isMinimal ? 'clamp(12px, 1.5vw, 15px)' : 'clamp(14px, 2vw, 19px)',
            color: isMinimal ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.45)',
            margin: isMinimal ? '16px 0 0' : '10px 0 0', fontWeight: 400,
            letterSpacing: isMinimal ? '0.15em' : '0.01em',
            textTransform: isMinimal ? 'uppercase' : 'none',
            fontFamily: bodyFont ? `'${bodyFont}', inherit` : undefined,
          }}>{clientName}</p>
        </div>
      )}

      {/* Welcome message — animated */}
      {welcomeMessage && (() => {
        // Split into tokens: words + line breaks
        const tokens: Array<{ text: string; isBreak: boolean }> = []
        welcomeMessage.split('\n').forEach((line, li) => {
          if (li > 0) tokens.push({ text: '', isBreak: true })
          line.split(' ').filter(Boolean).forEach(w => tokens.push({ text: w, isBreak: false }))
        })
        const wordCount = tokens.filter(t => !t.isBreak).length
        const msgRTL = /[\u0590-\u05FF\u0600-\u06FF]/.test(welcomeMessage.charAt(0))
        const speedMul = animationSpeed === 'slow' ? 1.5 : animationSpeed === 'fast' ? 0.6 : 1
        const baseDelay = 0.8 * speedMul
        const perWord = Math.min(0.12, 2 / wordCount) * speedMul

        const animKeyframes = {
          blur: `@keyframes wcWordIn { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: blur(0); } }`,
          typewriter: `@keyframes wcWordIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`,
          slide: `@keyframes wcWordIn { from { opacity: 0; transform: translateX(${msgRTL ? '20px' : '-20px'}); } to { opacity: 1; transform: translateX(0); } }`,
        }
        const wordDuration = textAnimation === 'typewriter' ? 0.3 : textAnimation === 'slide' ? 0.5 : 0.4

        return (<>
          <style>{animKeyframes[textAnimation]}</style>
          <div style={{
            margin: '24px auto 0', maxWidth: 520, padding: '0 20px',
            direction: msgRTL ? 'rtl' : 'ltr',
            textAlign: 'center',
          }}>
            <p style={{
              fontSize: 'clamp(15px, 2vw, 20px)',
              color: 'rgba(255,255,255,.7)',
              margin: 0, fontWeight: 400,
              lineHeight: 1.7,
              fontStyle: 'italic',
              letterSpacing: '0.01em',
            }}>
              {(() => {
                let wordIdx = 0
                return tokens.map((token, ti) => {
                  if (token.isBreak) return <br key={`br-${ti}`} />
                  const wi = wordIdx++
                  return (
                    <span key={ti} style={{
                      opacity: 0,
                      animation: visible ? `wcWordIn ${wordDuration}s cubic-bezier(.16,1,.3,1) ${baseDelay + wi * perWord}s both` : 'none',
                    }}>
                      {token.text}{' '}
                    </span>
                  )
                })
              })()}
            </p>
          </div>
        </>)
      })()}

      {/* Event meta */}
      {(eventDate || eventLocation) && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .8s both' : 'none' }}>
          <p style={{
            fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '10px 0 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.03em',
          }}>
            {eventDate && <span>{eventDate}</span>}
            {eventDate && eventLocation && <span style={{ opacity: .3 }}>{isMinimal ? '|' : '\u00b7'}</span>}
            {eventLocation && <span>{eventLocation}</span>}
          </p>
        </div>
      )}

      {galleryDescription && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .85s both' : 'none' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.22)', margin: '8px auto 0', maxWidth: 420 }}>
            {galleryDescription}
          </p>
        </div>
      )}

      {/* Private mode notice */}
      {isPrivate && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .9s both' : 'none', marginTop: 20 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: isMinimal ? 0 : 20,
            background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.55)" strokeWidth="1.8" style={{ animation: 'wcFloat 2.5s ease-in-out infinite' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontWeight: 400 }}>
              {wsTxt.privacyModeBadge}
            </span>
          </div>
        </div>
      )}

      {/* Buttons — delayed until welcome message is half done */}
      <div style={{
        display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32,
        animation: visible ? `wcFadeUp .9s cubic-bezier(.16,1,.3,1) ${
          welcomeMessage
            ? (() => { const wc = welcomeMessage.split(/\s+/).filter(Boolean).length; return 2.2 + wc * Math.min(0.12, 2 / wc) * 0.6 })()
            : 1
        }s both` : 'none',
      }}>
        {!isPrivate && (
          <button onClick={handleEnter} style={{
            padding: isMinimal ? '14px 48px' : '15px 44px',
            borderRadius: isMinimal ? 0 : 50,
            border: isMinimal ? '1px solid rgba(255,255,255,.25)' : '1px solid rgba(255,255,255,.18)',
            background: isMinimal ? 'transparent' : 'rgba(255,255,255,.07)',
            backdropFilter: isMinimal ? 'none' : 'blur(20px)',
            color: '#fff',
            fontSize: isMinimal ? 11 : 15,
            fontWeight: isMinimal ? 500 : 600, cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: isMinimal ? '0.18em' : '0.01em',
            textTransform: isMinimal ? 'uppercase' as const : 'none' as const,
            transition: 'all .3s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = isMinimal ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.16)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)'; e.currentTarget.style.transform = 'scale(1.03)' }}
            onMouseLeave={e => { e.currentTarget.style.background = isMinimal ? 'transparent' : 'rgba(255,255,255,.07)'; e.currentTarget.style.borderColor = isMinimal ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.18)'; e.currentTarget.style.transform = 'scale(1)' }}
          >{wsTxt.viewGallery}</button>
        )}

        {showFindButton && (
          <button onClick={onFindMyPhotos} style={{
            padding: isPrivate ? '16px 48px' : '15px 36px',
            borderRadius: isMinimal ? 0 : 50, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'all .3s',
            display: 'flex', alignItems: 'center', gap: 10,
            animation: isPrivate ? 'wcGlow 3s ease-in-out infinite' : 'none',
            position: 'relative', zIndex: 10,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
            {wsTxt.findMyPhotos}
          </button>
        )}
      </div>
    </div>
  )

  // ── Mosaic background ──
  const renderMosaicBg = () => (
    <>
      <style>{`
        @keyframes wcScroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes wcBgFadeIn { from { opacity: 0; } to { opacity: var(--wc-bg-target, 0.45); } }
        .wc-col { display: flex; flex-direction: column; gap: 2px; }
        .wc-col img {
          width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block;
          opacity: 0; transition: opacity .6s ease;
        }
        .wc-col img.wc-loaded { opacity: 1; }
      `}</style>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', gap: 2,
        ['--wc-bg-target' as string]: isPrivate ? 0.06 : 0.45,
        animation: 'wcBgFadeIn 2s ease .2s both',
        filter: isPrivate ? 'blur(40px) saturate(.3)' : 'none',
      }}>
        {(() => {
          const colCount = 6
          const allImgs = images.length > 0 ? images : []
          const shuffle = (arr: typeof images, seed: number) => {
            const a = [...arr]
            for (let i = a.length - 1; i > 0; i--) {
              seed = (seed * 16807 + 0) % 2147483647
              const j = seed % (i + 1)
              ;[a[i], a[j]] = [a[j], a[i]]
            }
            return a
          }
          const columns = Array.from({ length: colCount }, (_, ci) => {
            const col: typeof images = []
            const shuffled = shuffle(allImgs, ci * 7919 + 1)
            const needed = Math.max(12, Math.ceil(allImgs.length / colCount) * 3)
            let lastId = ''
            for (let j = 0; col.length < needed; j++) {
              const img = shuffled[j % shuffled.length]
              if (img.id !== lastId || allImgs.length <= 1) {
                col.push(img)
                lastId = img.id
              }
            }
            return col
          })
          return columns.map((col, ci) => {
            const doubled = [...col, ...col]
            const speed = 40 + (ci % 3) * 15
            const dir = ci % 2 === 0 ? 'normal' : 'reverse'
            return (
              <div key={ci} style={{ flex: 1, overflow: 'hidden' }}>
                <div className="wc-col" style={{
                  animation: `wcScroll ${speed}s linear infinite`,
                  animationDirection: dir,
                }}>
                  {doubled.map((img, i) => (
                    <img
                      key={`${ci}-${i}`}
                      src={getUrl(img.thumbnail_path || img.storage_path)}
                      alt=""
                      onLoad={e => e.currentTarget.classList.add('wc-loaded')}
                    />
                  ))}
                </div>
              </div>
            )
          })
        })()}
      </div>
      {/* Mosaic overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: isPrivate
          ? 'radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.88) 100%)'
          : 'radial-gradient(ellipse at center, rgba(0,0,0,.35) 0%, rgba(0,0,0,.78) 100%)',
      }} />
    </>
  )

  // ── Cinematic background ──
  const renderCinematicBg = () => {
    const bgSrc = coverImageUrl || (images.length > 0 ? getUrl(images[0].thumbnail_path || images[0].storage_path) : null)
    return (
      <>
        <style>{`
          @keyframes wcCineZoom { 0% { transform: scale(1.05); } 100% { transform: scale(1.12); } }
          @keyframes wcCineFadeIn { from { opacity: 0; } to { opacity: var(--wc-cine-target, 0.55); } }
          @keyframes wcParticle {
            0% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-100vh) translateX(40px); opacity: 0; }
          }
        `}</style>
        {bgSrc && (
          <div style={{
            position: 'absolute', inset: '-10%',
            ['--wc-cine-target' as string]: isPrivate ? 0.08 : 0.55,
            filter: isPrivate ? 'blur(50px) saturate(.2)' : 'blur(8px) saturate(1.1)',
            animation: 'wcCineFadeIn 2.5s ease .2s both, wcCineZoom 20s ease-in-out infinite alternate',
          }}>
            <img
              src={bgSrc}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                ...(coverCrop ? { objectPosition: `${50 + (coverCrop.x || 0)}% ${50 + (coverCrop.y || 0)}%` } : {}),
              }}
            />
          </div>
        )}
        {/* Heavy vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse at center, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 100%)',
            'linear-gradient(to bottom, rgba(0,0,0,.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.5) 100%)',
          ].join(', '),
        }} />
        {/* Floating particles */}
        {visible && !isPrivate && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${(i * 37 + 13) % 100}%`,
                bottom: '-5%',
                width: i % 3 === 0 ? 2 : 1,
                height: i % 3 === 0 ? 2 : 1,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.4)',
                animation: `wcParticle ${8 + (i % 7) * 2}s linear ${i * 0.7}s infinite`,
              }} />
            ))}
          </div>
        )}
      </>
    )
  }

  // ── Minimal background (pure black + subtle accent lines) ──
  const renderMinimalBg = () => (
    <>
      <style>{`
        @keyframes wcMinLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
      {visible && (
        <>
          <div style={{
            position: 'absolute', top: '38%', left: '10%', right: '10%', height: 1,
            background: 'rgba(255,255,255,.04)', transformOrigin: 'left center',
            animation: 'wcMinLine 1.5s cubic-bezier(.16,1,.3,1) .6s both',
          }} />
          <div style={{
            position: 'absolute', top: '62%', left: '10%', right: '10%', height: 1,
            background: 'rgba(255,255,255,.04)', transformOrigin: 'right center',
            animation: 'wcMinLine 1.5s cubic-bezier(.16,1,.3,1) .8s both',
          }} />
        </>
      )}
    </>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: entered ? 0 : 1, transition: 'opacity .7s ease',
      overflow: 'hidden',
    }}>
      {/* Shared keyframes */}
      <style>{`
        @keyframes wcFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wcGlow { 0%, 100% { box-shadow: 0 0 24px rgba(99,102,241,.3); } 50% { box-shadow: 0 0 48px rgba(99,102,241,.5), 0 0 80px rgba(99,102,241,.15); } }
        @keyframes wcFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes wcLine { from { left: -30%; } to { left: 130%; } }
        @keyframes wcReveal { from { opacity: 0; transform: translateY(30px) scale(.97); clip-path: inset(100% 0 0 0); } to { opacity: 1; transform: translateY(0) scale(1); clip-path: inset(0 0 0 0); } }
        @keyframes wcLetterSpace { from { opacity: 0; letter-spacing: 0.12em; } to { opacity: 1; letter-spacing: 0.04em; } }
      `}</style>

      {/* Style-specific background */}
      {style === 'mosaic' && renderMosaicBg()}
      {style === 'cinematic' && renderCinematicBg()}
      {style === 'minimal' && renderMinimalBg()}

      {/* Private mode: accent line (all styles) */}
      {isPrivate && visible && (
        <div style={{
          position: 'absolute', top: '50%', width: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,.35), transparent)',
          animation: 'wcLine 3.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Content */}
      {renderContent()}
    </div>
  )
}

/** Safely read a delivery_settings field with a fallback default. */
function s<K extends keyof DeliverySettings>(settings: Partial<DeliverySettings>, key: K, fallback: DeliverySettings[K]): DeliverySettings[K] {
  const v = settings[key]
  return v === undefined || v === null ? fallback : v as DeliverySettings[K]
}

// ─── Sticky section nav (Pixieset-style) ───────────────────────────────────
// Three-column sticky bar: gallery section pills (left), the Stories toggle
// (center), and the download / select toolbar (right). Each slot is optional;
// the grid template keeps the layout balanced even when one slot is empty.
function SectionNav({
  sections,
  sectionCounts,
  totalCount,
  showAllPill,
  activeId,
  onJump,
  centerToolbar,
  toolbar,
}: {
  sections: GallerySection[]
  sectionCounts: Record<string, number>
  totalCount: number
  showAllPill?: boolean
  activeId: string
  onJump: (id: string) => void
  centerToolbar?: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const hasSections = sections.length > 0
  return (
    <nav className="section-nav">
      <div className="section-nav__inner">
        <div className="section-nav__items">
          {hasSections && showAllPill && (
            <button
              className={`section-nav__item ${activeId === 'all-images' ? 'section-nav__item--active' : ''}`}
              onClick={() => onJump('all-images')}
            >
              <span className="section-nav__label">All Photos</span>
              <span className="section-nav__count">{totalCount}</span>
            </button>
          )}
          {hasSections && (
            <>
              {sections.map(sec => {
                const id = `section-${sec.id}`
                return (
                  <button
                    key={sec.id}
                    className={`section-nav__item ${activeId === id ? 'section-nav__item--active' : ''}`}
                    onClick={() => onJump(id)}
                  >
                    <span className="section-nav__label">{sec.name}</span>
                    <span className="section-nav__count">{sectionCounts[sec.id] ?? 0}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>
        <div className="section-nav__center">{centerToolbar}</div>
        <div className="section-nav__toolbar">{toolbar}</div>
      </div>
    </nav>
  )
}

export function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [sections, setSections] = useState<GallerySection[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [dlProgress, setDlProgress] = useState<string | null>(null)
  // Default anchor: real all-images section if no sections, else the first
  // section. Initialized in an effect once gallery data is loaded.
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string>('all-images')

  // Active section view: when set, the page renders ONLY this section's grid
  // (replaces the stacked-sections layout). Tapping a pill swaps content,
  // tapping the gallery title returns to the all-sections view.
  // null = default stacked-sections layout (safe; this is the historic
  // behavior, no risk of regressing the live gallery).
  const [activeSectionView, setActiveSectionView] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('section')
    } catch {
      return null
    }
  })

  // Mirror activeSectionView onto ?section=<slug> (preferred) or <id>
  // (fallback) so refreshes / shares stay on the same section. Wrapped in
  // try/catch so a malformed URL never takes the page down.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (activeSectionView) {
        // Prefer the slug if we have it (much friendlier shareable URL),
        // fall back to the raw UUID otherwise.
        const sec = sections.find(s => s.id === activeSectionView || s.slug === activeSectionView)
        const param = sec?.slug || activeSectionView
        url.searchParams.set('section', param)
      } else {
        url.searchParams.delete('section')
      }
      window.history.replaceState(null, '', url.toString())
    } catch { /* ignore — url sync is a UX nicety, never load-bearing */ }
  }, [activeSectionView, sections])

  // When loading from a URL with ?section=<slug>, resolve the slug back to
  // the canonical section id so the rest of the component (which keys on id)
  // works without per-call slug lookups.
  useEffect(() => {
    if (!activeSectionView || sections.length === 0) return
    const matchById = sections.find(s => s.id === activeSectionView)
    if (matchById) return
    const matchBySlug = sections.find(s => s.slug === activeSectionView)
    if (matchBySlug) setActiveSectionView(matchBySlug.id)
  }, [sections, activeSectionView])

  // Auto-select the first section once gallery data is loaded, IF and only
  // if (a) the gallery actually has sections, (b) we don't already have a
  // valid active view from the URL. Galleries without sections keep
  // activeSectionView = null and render the all-photos layout.
  useEffect(() => {
    if (sections.length === 0) return
    setActiveSectionView(prev => {
      if (prev && sections.some(s => s.id === prev)) return prev
      return sections[0].id
    })
  }, [sections])
  const [viewerRole, setViewerRole] = useState<'none' | 'client' | 'guest'>('none')
  const [clientCodeInput, setClientCodeInput] = useState('')
  const [clientCodeError, setClientCodeError] = useState(false)
  const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())
  // Active story index for the full-screen StoryPlayer overlay. null = closed.
  // Set when a guest taps a story thumbnail in the collapsible row below.
  const [storyPlayerIndex, setStoryPlayerIndex] = useState<number | null>(null)

  // Stories are collapsed by default. The viewer surfaces them via a toggle
  // button in the section-nav toolbar so the gallery doesn't open with a big
  // stories block above the photos.
  const [storiesOpen, setStoriesOpen] = useState(false)
  // Face search: null = no search done; Set = matched IDs (always kept once found)
  const [faceMatchIds, setFaceMatchIds] = useState<Set<string> | null>(null)
  // Toggle: true = show only face matches, false = show all (but keep matches for toggling back)
  const [faceFilterActive, setFaceFilterActive] = useState(false)
  const [showFaceSearch, setShowFaceSearch] = useState(false)
  const [faceSelfieUrl, setFaceSelfieUrl] = useState<string | null>(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  // Brief auto-dismissing toast for the "HD original still uploading,
  // saved web copy instead" path. Distinct from dlProgress because that
  // overlay is for in-flight batch downloads with a progress bar.
  const [hdNotice, setHdNotice] = useState<string | null>(null)
  // When the fullscreen viewer opens, it navigates through whichever list
  // the clicked tile belonged to (full gallery / face-match filter / section).
  // Snapshotting at click time means next/prev stays inside that subset and
  // doesn't break if the filter later changes.
  const [viewerList, setViewerList] = useState<GalleryImage[] | null>(null)

  // Device detection for download UX
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isAndroid = /Android/i.test(navigator.userAgent)

  // Download progress tracking
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  // Parse gallery from URL
  const galleryRef = useMemo(() => {
    const path = window.location.pathname.replace(/\/+$/, '')
    // Short slug form: /<biz>/g/<gallery-slug> (NEW)
    const short = path.match(/^\/([^/]+)\/g\/([^/]+)$/)
    if (short) return { type: 'slug' as const, businessSlug: short[1], gallerySlug: short[2] }
    const legacy = path.match(/^\/[^/]+\/gallery\/([^/]+)$/)
    if (legacy) return { type: 'id' as const, value: legacy[1] }
    const direct = path.match(/^\/gallery\/([^/]+)$/)
    if (direct) return { type: 'id' as const, value: direct[1] }
    const clean = path.match(/^\/([^/]+)\/([^/]+)$/)
    if (clean) return { type: 'slug' as const, businessSlug: clean[1], gallerySlug: clean[2] }
    return null
  }, [])

  useEffect(() => {
    if (!galleryRef) { setError('No gallery ID in URL'); return }
    if (galleryRef.type === 'id') {
      loadGallery(galleryRef.value)
    } else {
      (async () => {
        try {
          const { data: bizRows } = await supabase.rpc('get_business_by_slug', { p_slug: galleryRef.businessSlug })
          const biz = bizRows?.[0]
          if (!biz) { setError('Gallery not found'); return }
          const { data: g } = await supabase.from('galleries').select('*')
            .eq('business_id', biz.id).eq('slug', galleryRef.gallerySlug)
            .in('status', ['live', 'published', 'draft']).single()
          if (g) { loadGallery(g.id); return }
          const { data: byName } = await supabase.from('galleries').select('*')
            .eq('business_id', biz.id).in('status', ['live', 'published', 'draft'])
            .ilike('name', galleryRef.gallerySlug.replace(/-/g, '%')).limit(1)
          if (byName?.[0]) { loadGallery(byName[0].id); return }
          setError('Gallery not found')
        } catch { setError('Gallery not found') }
      })()
    }
  }, [galleryRef])

  // Scroll-spy: track which section is in view and update activeSectionAnchor.
  // We watch the All Images section + every section block. The first one
  // intersecting wins.
  useEffect(() => {
    if (sections.length === 0 || showWelcome) return
    // When sections cover the gallery we no longer render an "all-images"
    // section; only watch per-section anchors.
    const ids = sections.length > 0
      ? sections.map(sec => `section-${sec.id}`)
      : ['all-images']
    const elements = ids
      .map(id => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's currently
        // intersecting. Sort by boundingClientRect.top so a section that's
        // crossing the nav line is preferred over one already deep in view.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          setActiveSectionAnchor(visible[0].target.id)
        }
      },
      {
        // The observer fires when a section's top is between 70px from the
        // top of the viewport and 60% of the viewport height.
        rootMargin: '-70px 0px -40% 0px',
        threshold: 0,
      }
    )

    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [sections, showWelcome, images])

  // Load hidden images for this gallery
  useEffect(() => {
    if (!gallery) return
    if (!unlocked) return  // gated galleries: wait for the unlock token
    gcGetHidden(gallery.id).then(ids => {
      setHiddenImageIds(new Set(ids))
    })
  }, [gallery?.id, unlocked])

  // Hydrate guest favorites from localStorage. RLS doesn't allow anon to
  // read gallery_favorites (the photographer's analytics signal is owner-
  // only); the guest-side source of truth is local. The DB row is fired
  // on each toggle for the photographer's Activities tab.
  useEffect(() => {
    if (!gallery) return
    try {
      const raw = localStorage.getItem(`gf_favs_${gallery.id}`)
      if (raw) setFavoritedIds(new Set(JSON.parse(raw) as string[]))
    } catch { /* ignore corrupt entries */ }
  }, [gallery?.id])

  const toggleImageFavorite = useCallback((imageId: string) => {
    if (!gallery) return
    setFavoritedIds(prev => {
      const next = new Set(prev)
      const wasFav = next.has(imageId)
      if (wasFav) next.delete(imageId); else next.add(imageId)
      try { localStorage.setItem(`gf_favs_${gallery.id}`, JSON.stringify(Array.from(next))) } catch { /* full / disabled */ }
      void apiToggleFavorite(gallery.id, imageId, !wasFav)
      return next
    })
  }, [gallery])

  // On first load, if the URL has a hash (e.g. #section-abc), scroll to it
  // once the masonry has rendered.
  useEffect(() => {
    if (showWelcome || images.length === 0) return
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    // Wait one tick so the masonry can paint and the IDs are mounted.
    const id = setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
    return () => clearTimeout(id)
  }, [showWelcome, images.length])

  async function loadGallery(id: string) {
    const meta = await gcGetMeta(id)
    if (!meta) {
      setError('Gallery not found')
      return
    }
    const g = meta as unknown as Gallery
    const gateOn = (meta as { signed_gate_enabled?: boolean }).signed_gate_enabled === true
    const hasPw  = (meta as { has_password?: boolean }).has_password === true

    if (isGalleryUnlocked(id)) {
      setUnlocked(true)
    }

    // In private face-search mode, the bulk image fetch returns nothing — the
    // matched rows come back from the rekognition edge function instead.
    const isPrivateFaceMode =
      ((g.delivery_settings as { facePrivacyMode?: string } | null)?.facePrivacyMode) === 'private'

    // For galleries that are signed-gate-enabled AND password-protected, we
    // must wait for the user to unlock before fetching images / stories /
    // hidden state — those RPCs require a token. The PasswordGate effect
    // re-runs loadGallery? No: it just flips `unlocked`, and the dependent
    // useEffects pick up the rest (hidden, etc). For images + stories we
    // mirror that here: skip the heavy fetch when the gate hasn't been passed.
    const mustWaitForUnlock = gateOn && hasPw && !isGalleryUnlocked(id)

    const fetchAllImages = async (): Promise<GalleryImage[]> => {
      const PAGE = 1000
      const out: GalleryImage[] = []
      for (let offset = 0; ; offset += PAGE) {
        const rows = await gcGetImages<GalleryImage>(id, { offset, limit: PAGE })
        out.push(...rows)
        if (rows.length < PAGE) break
      }
      return out
    }
    const [imgs, secsRes] = await Promise.all([
      (isPrivateFaceMode || mustWaitForUnlock) ? Promise.resolve([] as GalleryImage[]) : fetchAllImages(),
      // gallery_sections is intentionally left on the legacy public path —
      // section names ("Day 1", "Day 2") are far less sensitive than image
      // contents, and gating them here would force every PasswordGate render
      // to wait on token issuance for what is essentially a label.
      supabase
        .from('gallery_sections')
        .select('id, name, slug, sort_order')
        .eq('gallery_id', id)
        .order('sort_order', { ascending: true }),
    ])
    setImages(imgs)
    setSections(secsRes.data || [])
    setGallery(g)

    if (mustWaitForUnlock) return  // stories deferred to the unlock effect below

    const stories = await gcGetStories<Story>(id)
    if (stories.length > 0) {
      const verified: Story[] = []
      for (const story of stories) {
        const url = storageUrl('gallery-stories', story.storage_path)
        try {
          const res = await fetch(url, { method: 'HEAD' })
          if (res.ok) verified.push(story)
        } catch { /* skip */ }
      }
      setStories(verified)
    }
  }

  // ── Phase 4.5.C/D — public-viewer session bootstrap ─────────────────────
  // When a gallery loads, fire-and-forget request a public-viewer token so
  // signedStorage.ts has it ready before any signed_url call. No-op when
  // VITE_PUBLIC_VIEWER_SIGNED_URLS is not '1' (the helper short-circuits).
  // Refreshes silently every 50 minutes; mid-scroll expiry is handled
  // lazily by signedStorage.ts which re-issues on cache miss.
  //
  // P4.5.D: when the server returns 429 turnstile_required, store the site
  // key in state so the TurnstileWidget renders. The widget's onToken
  // callback re-calls ensurePublicSession with the resolved token.
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  useEffect(() => {
    if (!gallery?.id) return
    if (!isPublicViewerSignedUrlsEnabled()) return
    let cancelled = false
    ;(async () => {
      const r = await ensurePublicSession(gallery.id)
      if (cancelled) return
      if (r.notLive) {
        // Gallery isn't live anymore — surface a 404-ish state. We don't
        // wipe the existing UI here; the user already sees the gallery,
        // just future signed_url calls will fail and fall back to public.
        // P4.5.E will tighten this when the bucket actually flips.
        console.warn('[publicSession] gallery_not_live')
      }
      if (r.needsTurnstile) {
        setTurnstileSiteKey(r.needsTurnstile.siteKey)
      }
    })()
    const REFRESH_MS = 50 * 60 * 1000
    const iv = setInterval(() => {
      ensurePublicSession(gallery.id, { bypassCache: true }).catch(() => { /* silent */ })
    }, REFRESH_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [gallery?.id])

  // Re-issue the session once Turnstile resolves a token.
  const onTurnstileToken = useCallback(async (token: string) => {
    if (!gallery?.id) return
    const r = await ensurePublicSession(gallery.id, { turnstileToken: token, bypassCache: true })
    if (r.token) {
      setTurnstileSiteKey(null) // dismiss the widget on success
    }
  }, [gallery?.id])

  // After unlock, fetch the gated content (images + stories) for galleries
  // that deferred them in loadGallery. No-op for galleries already loaded.
  useEffect(() => {
    if (!gallery || !unlocked || images.length > 0) return
    const isPrivateFaceMode =
      ((gallery.delivery_settings as { facePrivacyMode?: string } | null)?.facePrivacyMode) === 'private'
    if (isPrivateFaceMode) return
    ;(async () => {
      const PAGE = 1000
      const out: GalleryImage[] = []
      for (let offset = 0; ; offset += PAGE) {
        const rows = await gcGetImages<GalleryImage>(gallery.id, { offset, limit: PAGE })
        out.push(...rows)
        if (rows.length < PAGE) break
      }
      setImages(out)
      const stories = await gcGetStories<Story>(gallery.id)
      if (stories.length > 0) {
        const verified: Story[] = []
        for (const story of stories) {
          const url = storageUrl('gallery-stories', story.storage_path)
          try {
            const res = await fetch(url, { method: 'HEAD' })
            if (res.ok) verified.push(story)
          } catch { /* skip */ }
        }
        setStories(verified)
      }
    })()
  }, [gallery?.id, unlocked])

  const handleUnlock = useCallback(() => setUnlocked(true), [])

  // Resolve client selection settings (safe even when gallery is null)
  const rawSettings: Partial<DeliverySettings> = (gallery?.delivery_settings || {}) as Partial<DeliverySettings>
  const clientSelectionEnabled = rawSettings.clientSelectionEnabled ?? false
  const clientCode = rawSettings.clientCode ?? ''

  // Auto-skip role selection if client selection is not enabled,
  // or restore client role from session
  useEffect(() => {
    if (!gallery) return
    if (!clientSelectionEnabled) {
      setViewerRole('guest')
      return
    }
    const saved = sessionStorage.getItem(`client-role-${gallery.id}`)
    if (saved === 'client') setViewerRole('client')
  }, [gallery, clientSelectionEnabled])

  // Toggle hidden state for an image (client mode)
  const toggleHideImage = useCallback(async (imageId: string) => {
    if (!gallery) return
    const isHidden = hiddenImageIds.has(imageId)
    await gcSetHidden(gallery.id, imageId, !isHidden)
    setHiddenImageIds(prev => {
      const next = new Set(prev)
      if (isHidden) next.delete(imageId); else next.add(imageId)
      return next
    })
  }, [gallery, hiddenImageIds])

  // Visible images: guests see only non-hidden, clients see all. Face search
  // filter is applied on top for guests only (clients always see the full set).
  const visibleImages = useMemo(() => {
    if (viewerRole === 'client') return images
    const base = images.filter(img => !hiddenImageIds.has(img.id))
    if (!faceMatchIds || !faceFilterActive) return base
    return base.filter(img => faceMatchIds.has(img.id))
  }, [images, hiddenImageIds, viewerRole, faceMatchIds, faceFilterActive])

  // Surface face search whenever there's a usable index — that's any
  // gallery in 'done', AND any gallery still 'indexing' once at least one
  // face has been registered. Without this second clause the button stays
  // hidden whenever the worker hasn't finished (or got stuck mid-batch),
  // which is exactly when a guest most needs to find their photos: the
  // photographer just uploaded and indexing is catching up. A partial
  // index is still useful — Rekognition just searches against whatever
  // vectors exist, and the worker keeps adding more in the background.
  const faceSearchAvailable =
    gallery?.face_index_status === 'done' ||
    (gallery?.face_index_status === 'indexing' && (gallery?.face_indexed_count ?? 0) > 0)

  const lang = (((gallery?.delivery_settings || {}) as Record<string, unknown>).language as Lang) || 'he'
  const txt = t(lang)

  useEffect(() => {
    if (!gallery) return
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [gallery, lang])

  // ── Storage hooks (must live above all early returns) ───────────────────
  // These three useState/useEffect pairs MUST be called unconditionally on
  // every render — React error #310 fires the moment the hook count
  // diverges between renders. The error/!gallery/password-gate early
  // returns below would otherwise skip them and crash on subsequent paint.
  // Inputs are computed defensively so they tolerate gallery=null and an
  // empty images list during the initial pre-load render.
  const _hookRaw = (gallery?.delivery_settings || {}) as Record<string, unknown>
  const _hookImgBucket = gallery?.demo_expires_at ? 'demo-uploads' : 'gallery-images'
  const _hookCoverImageId = (_hookRaw.coverImageId as string | null | undefined) ?? null
  const _hookCoverImageUrlSetting = (_hookRaw.coverImageUrl as string | null | undefined) ?? null
  const _hookCoverImage = _hookCoverImageId ? images.find(img => img.id === _hookCoverImageId) ?? null : null
  const _hookCoverImgForResolve = (() => {
    if (!_hookCoverImageId) return null
    const cid = _hookCoverImageId
    const cFilename = cid.includes('/') ? cid.split('/').pop() : cid
    return images.find(i => i.id === cid || i.filename === cid || i.filename === cFilename) ?? null
  })()
  const _hookWelcomeImages = (() => {
    const TARGET = 30
    const topPicks = images.filter(img => img.is_top_pick)
    if (topPicks.length > 0) return topPicks.slice(0, TARGET)
    if (sections.length <= 1) return images.slice(0, TARGET)
    const perSection = Math.ceil(TARGET / sections.length)
    const result: GalleryImage[] = []
    for (const sec of sections) {
      const secImgs = images.filter(img => img.section_id === sec.id)
      result.push(...secImgs.slice(0, perSection))
    }
    const unsectioned = images.filter(img => !img.section_id)
    result.push(...unsectioned.slice(0, Math.max(0, TARGET - result.length)))
    return result.slice(0, TARGET)
  })()

  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | null>(
    _hookCoverImageUrlSetting
      ?? (_hookCoverImgForResolve ? storageUrl(_hookImgBucket, _hookCoverImgForResolve.storage_path) : null),
  )
  useEffect(() => {
    if (_hookCoverImageUrlSetting) {
      setResolvedCoverUrl(_hookCoverImageUrlSetting); return
    }
    if (!_hookCoverImgForResolve) { setResolvedCoverUrl(null); return }
    let cancelled = false
    signedStorageUrl(_hookImgBucket, _hookCoverImgForResolve.storage_path)
      .then(url => { if (!cancelled) setResolvedCoverUrl(url) })
      .catch(() => { /* fallback handled by helper */ })
    return () => { cancelled = true }
  }, [_hookImgBucket, _hookCoverImgForResolve?.storage_path, _hookCoverImageUrlSetting])

  const [welcomeUrlMap, setWelcomeUrlMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!showWelcome || _hookWelcomeImages.length === 0) return
    let cancelled = false
    const paths = Array.from(new Set(
      _hookWelcomeImages.flatMap(img => [img.thumbnail_path, img.storage_path]).filter(Boolean) as string[],
    ))
    Promise.all(paths.map(async p => [p, await signedStorageUrl(_hookImgBucket, p)] as [string, string]))
      .then(pairs => { if (!cancelled) setWelcomeUrlMap(new Map(pairs)) })
      .catch(() => { /* fallback to public URLs via callback */ })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome, _hookWelcomeImages.length, _hookImgBucket])

  const [coverUrl, setCoverUrl] = useState<string | null>(
    _hookCoverImage ? storageUrl(_hookImgBucket, _hookCoverImage.storage_path) : null,
  )
  useEffect(() => {
    if (!_hookCoverImage) { setCoverUrl(null); return }
    let cancelled = false
    signedStorageUrl(_hookImgBucket, _hookCoverImage.storage_path)
      .then(url => { if (!cancelled) setCoverUrl(url) })
      .catch(() => { /* fallback handled by helper */ })
    return () => { cancelled = true }
  }, [_hookImgBucket, _hookCoverImage?.storage_path])

  if (error) {
    return (
      <div className="center-msg">
        <p>{error}</p>
      </div>
    )
  }

  if (!gallery) {
    return (
      <div className="center-msg">
        <div className="loader" />
      </div>
    )
  }

  // ── Resolve settings with backward-compatible defaults ──────────────────
  const raw: Partial<DeliverySettings> = (gallery.delivery_settings || {}) as Partial<DeliverySettings>

  const accessType       = s(raw, 'accessType', 'public')
  const galleryTitle     = s(raw, 'galleryTitle', '') || gallery.name
  const clientName       = s(raw, 'clientName', '') || gallery.client_name
  const coverImageId     = s(raw, 'coverImageId', null)
  const feedLayout       = (raw as Record<string, unknown>).feedLayout as string || null
  const isFeedSetting    = feedLayout === 'feed'
  const isMobileDevice   = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const isFeedMode       = isFeedSetting && isMobileDevice
  // Layout — read the legacy layoutMode/imageSpacing/cornerStyle keys, then
  // honor the newer Design tab keys (thumbnailSize / gridSpacing) on top so
  // photographer choices in the Design tab actually reach the public viewer.
  // Backward compat: alma + lsports galleries don't have the new keys, so
  // their existing layoutMode/imageSpacing values keep working unchanged.
  const thumbnailSize    = ((raw as Record<string, unknown>).thumbnailSize as string) || null
  const gridSpacing      = ((raw as Record<string, unknown>).gridSpacing as string) || null
  const layoutModeFromThumb = thumbnailSize === 'large' ? '2-col' : (thumbnailSize === 'regular' ? '3-col' : null)
  const spacingFromGap   = gridSpacing === 'large' ? 'medium' : (gridSpacing === 'regular' ? 'small' : null)
  const layoutMode       = isFeedMode ? '1-col' : (layoutModeFromThumb ?? s(raw, 'layoutMode', '2-col'))
  const imageSpacing     = isFeedMode ? 'none' : (spacingFromGap ?? s(raw, 'imageSpacing', 'small'))
  const cornerStyle      = isFeedMode ? 'sharp' : s(raw, 'cornerStyle', 'sharp')
  // Typography — fonts the photographer picked in Design > Typography.
  // Falls through to the dashboard's base stack if unset.
  const headingFont      = (((raw as Record<string, unknown>).headingFont as string) || '').trim()
  const bodyFont         = (((raw as Record<string, unknown>).bodyFont as string) || '').trim()
  const studioName       = s(raw, 'studioName', '')
  const studioWebsite    = (raw as Record<string, unknown>).studioWebsite as string || ''
  const showFooterCredit = s(raw, 'showFooterCredit', true)
  const showStories      = s(raw, 'showStories', true)
  const downloadQuality  = s(raw, 'downloadQuality', 'original')
  // Backward compat: new downloadsEnabled falls back to old allowDownloads
  const downloadsEnabled = raw.downloadsEnabled !== undefined
    ? raw.downloadsEnabled
    : (raw as Record<string, unknown>).allowDownloads !== false
  const facePrivacyMode = ((raw as Record<string, unknown>).facePrivacyMode as 'open' | 'private') || 'open'

  // Theme color — selected by the photographer in the Design tab.
  // Supports both the legacy palette (indigo/rose/amber/teal/slate, used by
  // alma + lsports) and the new editorial palette (charcoal/sage/...). The
  // legacy "indigo" is mapped to the editorial charcoal so older galleries
  // adopt the new neutral by default rather than carrying the bright
  // indigo into the cream design.
  const themeColorId = ((raw as Record<string, unknown>).themeColor as string) || 'charcoal'
  const themeColors: Record<string, string> = {
    // Editorial palette (matches the photographer-side Design tab)
    charcoal: '#141413',
    sage:     '#7B8F6E',
    rose:     '#C18A8A',
    amber:    '#A67C52',
    teal:     '#5E8A8A',
    slate:    '#64748b',
    // Legacy aliases for galleries created before the editorial palette
    indigo:   '#141413',  // was '#6366f1' — re-mapped to charcoal
  }
  const themeAccent = themeColors[themeColorId] ?? themeColors.charcoal

  // Watermark settings — applied as a CSS overlay on web previews. Originals
  // download untouched (the watermark is presentation-only, not baked in).
  const watermarkEnabled = (raw as Record<string, unknown>).watermarkEnabled === true
  const watermarkText = (((raw as Record<string, unknown>).watermarkText as string) || studioName || '').trim()
  const watermarkPosition = ((raw as Record<string, unknown>).watermarkPosition as string) || 'bottom-right'

  // ── Password gate ──────────────────────────────────────────────────────
  // We no longer have the plaintext password on the client; the gate calls
  // verify_gallery_password() RPC. We rely on accessType alone to know
  // whether a gate is required.
  if (accessType === 'password' && !unlocked) {
    const signedGateOn = (gallery as { signed_gate_enabled?: boolean }).signed_gate_enabled === true
    return (
      <PasswordGate
        galleryId={gallery.id}
        galleryName={galleryTitle}
        onUnlock={handleUnlock}
        requireToken={signedGateOn}
      />
    )
  }

  // ── Welcome screen (collage of top picks) ──────────────────────────────
  // Source preference for the mosaic, in order:
  //   1) photographer-curated top picks (is_top_pick = true)
  //   2) first 30 photos, spread evenly across sections so the collage feels
  //      representative of the whole gallery rather than concentrated in one
  //      shoot block
  // 30 is the visual sweet spot for the 6-column scrolling mosaic — more
  // adds noise without adding feel.
  const TARGET = 30
  const topPicks = images.filter(img => img.is_top_pick)
  const welcomeImages = (() => {
    if (topPicks.length > 0) return topPicks.slice(0, TARGET)
    if (sections.length <= 1) return images.slice(0, TARGET)
    const perSection = Math.ceil(TARGET / sections.length)
    const result: GalleryImage[] = []
    for (const sec of sections) {
      const secImgs = images.filter(img => img.section_id === sec.id)
      result.push(...secImgs.slice(0, perSection))
    }
    const unsectioned = images.filter(img => !img.section_id)
    result.push(...unsectioned.slice(0, Math.max(0, TARGET - result.length)))
    return result.slice(0, TARGET)
  })()

  // ── Helpers ─────────────────────────────────────────────────────────────
  // Demo galleries store their images in the 'demo-uploads' bucket instead
  // of the regular 'gallery-images' bucket. Detect by checking demo_expires_at.
  const isDemoGallery = !!gallery?.demo_expires_at
  const imgBucket = isDemoGallery ? 'demo-uploads' : 'gallery-images'

  // Private face-mode: anon users can't fetch the bulk image list (RLS), so
  // `images` is intentionally empty until the selfie unlocks matches. The
  // welcome screen still needs to show — just without the mosaic. We force
  // 'cinematic' (which renders the cover image alone) when there's nothing
  // to mosaic with.
  const isPrivateFaceMode = faceSearchAvailable && facePrivacyMode === 'private'
  const welcomeStyleResolved: 'mosaic' | 'cinematic' | 'minimal' =
    images.length === 0 ? 'cinematic' : (rawSettings.welcomeStyle || 'mosaic')

  if (showWelcome && (images.length > 0 || isPrivateFaceMode)) {
    return (
      <>
        <WelcomeScreen
          style={welcomeStyleResolved}
          galleryTitle={galleryTitle}
          galleryDescription={rawSettings.galleryDescription || ''}
          welcomeMessage={(rawSettings as Record<string, unknown>).welcomeMessage as string || ''}
          textAnimation={((rawSettings as Record<string, unknown>).welcomeTextAnimation as 'blur' | 'typewriter' | 'slide') || 'blur'}
          animationSpeed={((rawSettings as Record<string, unknown>).welcomeAnimationSpeed as 'slow' | 'normal' | 'fast') || 'normal'}
          eventDate={rawSettings.eventDate || ''}
          eventLocation={rawSettings.eventLocation || ''}
          clientName={clientName || ''}
          studioName={studioName}
          studioWebsite={studioWebsite}
          images={welcomeImages}
          coverImageUrl={resolvedCoverUrl}
          coverCrop={((gallery?.delivery_settings || {}) as Partial<DeliverySettings>).coverCrop}
          storageUrl={(path: string) => welcomeUrlMap.get(path) ?? storageUrl(imgBucket, path)}
          onEnter={() => setShowWelcome(false)}
          faceSearchAvailable={faceSearchAvailable}
          facePrivacyMode={faceSearchAvailable ? facePrivacyMode : null}
          onFindMyPhotos={() => setShowFaceSearch(true)}
          lang={lang}
          headingFont={headingFont}
          bodyFont={bodyFont}
        />
        {/* Face search experience — full-screen flow with camera, thinking, results */}
        {showFaceSearch && gallery && (
          <FaceSearchExperience
            galleryId={gallery.id}
            backgroundImages={images.slice(0, 6)}
            storageUrl={(path: string) => storageUrl(imgBucket, path)}
            privacyMode={facePrivacyMode}
            lang={lang}
            onClose={() => setShowFaceSearch(false)}
            onSelfieCapture={(url) => setFaceSelfieUrl(url)}
            onMatches={(ids, serverImages) => {
              setFaceMatchIds(new Set(ids))
              setFaceFilterActive(true)
              setShowFaceSearch(false)
              // In private mode the bulk image fetch was skipped, so the only
              // images we have are the ones the server hydrated for matches.
              if (facePrivacyMode === 'private' && serverImages.length > 0) {
                setImages(serverImages as unknown as GalleryImage[])
              }
              if (ids.length > 0) setShowWelcome(false)
            }}
            onBrowseAll={() => {
              setShowFaceSearch(false)
              setShowWelcome(false)
            }}
          />
        )}
      </>
    )
  }

  // ── Role selection (Client / Guest) ─────────────────────────────────────
  if (clientSelectionEnabled && viewerRole === 'none') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999, background: '#0a0a0c',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {studioName && (
          <p style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 8 }}>
            {studioName}
          </p>
        )}
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{galleryTitle}</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', margin: '0 0 36px' }}>{txt.howToView}</p>

        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <button
            onClick={() => setViewerRole('guest')}
            style={{
              padding: '14px 36px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)',
              color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
          >
            {txt.guest}
          </button>
          <button
            onClick={() => {
              const el = document.getElementById('client-code-section')
              if (el) el.style.display = 'block'
            }}
            style={{
              padding: '14px 36px', borderRadius: 10,
              border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all .2s',
              boxShadow: '0 4px 20px rgba(99,102,241,.3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {txt.imTheClient}
          </button>
        </div>

        {/* Client code input */}
        <div id="client-code-section" style={{ display: 'none', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>{txt.enterClientCode}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={clientCodeInput}
              onChange={e => { setClientCodeInput(e.target.value.toUpperCase()); setClientCodeError(false) }}
              placeholder="CODE"
              style={{
                padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
                color: '#fff', background: 'rgba(255,255,255,.06)',
                border: clientCodeError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.15)',
                borderRadius: 8, outline: 'none', letterSpacing: '0.1em',
                width: 160, textAlign: 'center',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (clientCodeInput === clientCode) {
                    setViewerRole('client')
                    sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
                  } else {
                    setClientCodeError(true)
                  }
                }
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (clientCodeInput === clientCode) {
                  setViewerRole('client')
                  sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
                } else {
                  setClientCodeError(true)
                }
              }}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Enter
            </button>
          </div>
          {clientCodeError && (
            <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{txt.invalidCode}</p>
          )}
        </div>
      </div>
    )
  }

  function thumbUrl(img: GalleryImage) {
    return storageUrl(imgBucket, img.thumbnail_path || img.storage_path)
  }

  function webUrl(img: GalleryImage) {
    return storageUrl(imgBucket, img.storage_path)
  }

  function originalUrl(img: GalleryImage) {
    // The original_path column is set at row-creation time, but the actual
    // file only lands in storage when original_uploaded flips to true.
    // Until then, hitting the original URL returns 404 — fall back to the
    // already-uploaded web preview so the guest gets *something* instead of
    // a broken download.
    if (img.original_path && img.original_uploaded) {
      return storageUrl(imgBucket, img.original_path)
    }
    return storageUrl(imgBucket, img.storage_path)
  }

  /** True if the guest is requesting an HD download but the original
   * isn't actually in storage yet — used to surface a friendly notice
   * instead of a silent fallback. */
  function isOriginalPending(img: GalleryImage): boolean {
    return Boolean(img.original_path) && img.original_uploaded !== true
  }

  function downloadUrl(img: GalleryImage) {
    // 'original' and 'high' → serve original full-res file when available
    if (downloadQuality === 'original' || downloadQuality === 'high') return originalUrl(img)
    // 'web' → compressed web preview
    return webUrl(img)
  }

  function storyUrl(st: Story) {
    return storageUrl('gallery-stories', st.storage_path)
  }

  /** Show a 4-second auto-dismissing notice. Used to tell the guest we
   * served the web copy because the HD original isn't in storage yet. */
  function showHdNotice(msg: string) {
    setHdNotice(msg)
    setTimeout(() => setHdNotice(prev => prev === msg ? null : prev), 4000)
  }

  /** Trust storage, not the DB flag. The audit (and a real downloaded-only-
   *  111KB report from a guest) showed images.original_uploaded going stale
   *  vs. the actual file in S3 — the photographer ships the originals fine
   *  but the per-row UPDATE silently drops, and the guest gets a 100KB web
   *  preview instead of the 8 MB original. HEAD-check the original URL and
   *  fall back ONLY when storage genuinely says 404. ~50 ms penalty on the
   *  click is invisible next to the actual download. */
  async function resolveDownloadUrl(img: GalleryImage): Promise<{ url: string; downgraded: boolean }> {
    const wantsHd = downloadQuality === 'original' || downloadQuality === 'high'
    if (!wantsHd || !img.original_path) {
      // P4.5.D: when flag is on, route through signedStorageUrl. When flag
      // off, signedStorageUrl short-circuits to public URL — same behavior
      // as today (originalUrl/webUrl return public URLs).
      const path = wantsHd ? (img.original_uploaded ? img.original_path! : img.storage_path) : img.storage_path
      const url = await signedStorageUrl(imgBucket, path)
      return { url, downgraded: false }
    }
    // HD requested AND original_path is set: HEAD-check whether the file
    // really exists, then sign or fall back.
    const headCandidate = storageUrl(imgBucket, img.original_path)
    try {
      const head = await fetch(headCandidate, { method: 'HEAD' })
      if (head.ok) {
        const url = await signedStorageUrl(imgBucket, img.original_path)
        return { url, downgraded: false }
      }
    } catch {
      // Network blip — assume present and let the actual download surface any real error.
      const url = await signedStorageUrl(imgBucket, img.original_path)
      return { url, downgraded: false }
    }
    const fallbackUrl = await signedStorageUrl(imgBucket, img.storage_path)
    return { url: fallbackUrl, downgraded: true }
  }

  async function handleImageDownload(img: GalleryImage) {
    const { url, downgraded } = await resolveDownloadUrl(img)
    if (downgraded) {
      showHdNotice(txt.originalStillUploading ?? 'HD copy still uploading — saved web-quality version. Try again in a few minutes.')
    }
    handleDownload(url, img.filename)
    if (gallery) {
      const wantsHd = downloadQuality === 'original' || downloadQuality === 'high'
      void logDownload(gallery.id, img.id, wantsHd ? 'original' : 'web', 'single')
    }
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  async function handleDownload(url: string, filename: string) {
    if (isMobile) {
      setSavingPhoto(true)
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const cleanName = filename.replace(/\.[^.]+$/, '') + '.jpg'
        const file = new File([blob], cleanName, { type: 'image/jpeg' })
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: galleryTitle,
          })
        } else {
          // Fallback: direct download
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = cleanName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      } catch { /* user cancelled share sheet */ }
      finally { setSavingPhoto(false) }
      return
    }

    // Desktop: fetch blob → trigger download
    const res = await fetch(url)
    const blob = await res.blob()

    // Desktop / fallback: regular download
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleBatchDownload(imgs: GalleryImage[]) {
    if (gallery && imgs.length > 0) {
      const wantsHd = downloadQuality === 'original' || downloadQuality === 'high'
      void logBatchDownload(gallery.id, imgs.map(i => i.id), wantsHd ? 'original' : 'web')
    }
    // Resolve URLs in parallel BEFORE the download loop. HEAD-check each
    // original so a stale original_uploaded flag doesn't downgrade the
    // batch silently. Parallel HEADs add ~few hundred ms total.
    setDlProgress(`Checking ${imgs.length} files...`)
    const resolved = await Promise.all(imgs.map(resolveDownloadUrl))
    const downgradedCount = resolved.filter(r => r.downgraded).length
    if (downgradedCount > 0) {
      showHdNotice(txt.someOriginalsStillUploading ?? `${downgradedCount} HD originals are still uploading — those photos saved as web-quality. Try the batch again in a few minutes for full HD.`)
    }
    const urlFor = (i: number) => resolved[i].url
    // On mobile with Web Share API: fetch all files and share in ONE share sheet.
    // The user picks "Save X Images" and all photos go to the camera roll together.
    if (isMobile && navigator.share) {
      setDlProgress(`Preparing ${imgs.length} photos...`)
      setDownloadProgress({ current: 0, total: imgs.length })
      try {
        const files: File[] = []
        for (let i = 0; i < imgs.length; i++) {
          setDlProgress(`Loading ${i + 1} / ${imgs.length}...`)
          setDownloadProgress({ current: i + 1, total: imgs.length })
          try {
            const res = await fetch(urlFor(i))
            const blob = await res.blob()
            const cleanName = imgs[i].filename.replace(/\.[^.]+$/, '') + '.jpg'
            files.push(new File([blob], cleanName, { type: 'image/jpeg' }))
          } catch { /* skip failed image */ }
        }
        if (files.length > 0) {
          setDlProgress(null)
          setDownloadProgress(null)
          // Web Share API with multiple files — native OS share sheet opens with
          // "Save to Photos" option that saves all at once.
          if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({ files, title: galleryTitle })
            return
          }
        }
      } catch {
        // User cancelled or share failed — fall through to sequential downloads
      } finally {
        setDlProgress(null)
        setDownloadProgress(null)
      }
    }

    // Desktop (or mobile fallback): bundle all photos into a single ZIP.
    setDlProgress(`Preparing ${imgs.length} photos...`)
    setDownloadProgress({ current: 0, total: imgs.length })
    const safeTitle = (galleryTitle || 'gallery').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'gallery'

    // P4.6: when the public-viewer signed-URL flow is on, route the ZIP
    // through /api/gallery-zip — the server fetches via service-role and
    // streams the archive back. Avoids the per-image client-side fetches
    // that would each round-trip through signedStorage.
    if (isPublicViewerSignedUrlsEnabled() && gallery?.id) {
      try {
        const pvt = readPublicSessionToken(gallery.id) ?? ''
        if (!pvt) throw new Error('no_pvt')
        const wantsHd = downloadQuality === 'original' || downloadQuality === 'high'
        const res = await fetch('/api/gallery-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            galleryId: gallery.id,
            imageIds: imgs.map(i => i.id),
            pvt,
            quality: wantsHd ? 'original' : 'web',
            filenameStem: safeTitle,
          }),
        })
        if (!res.ok) throw new Error(`zip_${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${safeTitle}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      } catch (err) {
        console.warn('[gallery-zip] server-side failed, falling back to JSZip:', err)
        // fall through to client-side bundling below
      } finally {
        setDlProgress(null)
        setDownloadProgress(null)
      }
    }

    try {
      const zip = new JSZip()
      const usedNames = new Set<string>()
      for (let i = 0; i < imgs.length; i++) {
        setDlProgress(`Downloading ${i + 1} / ${imgs.length}...`)
        setDownloadProgress({ current: i + 1, total: imgs.length })
        try {
          const res = await fetch(downloadUrl(imgs[i]))
          const blob = await res.blob()
          let name = imgs[i].filename || `photo-${i + 1}.jpg`
          if (usedNames.has(name)) {
            const dot = name.lastIndexOf('.')
            const base = dot > 0 ? name.slice(0, dot) : name
            const ext = dot > 0 ? name.slice(dot) : ''
            name = `${base}-${i + 1}${ext}`
          }
          usedNames.add(name)
          zip.file(name, blob)
        } catch { /* skip failed image */ }
      }
      setDlProgress(`Creating ZIP...`)
      const zipBlob = await zip.generateAsync(
        { type: 'blob' },
        (meta) => setDlProgress(`Creating ZIP ${Math.round(meta.percent)}%...`),
      )
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeTitle}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP download failed:', err)
    } finally {
      setDlProgress(null)
      setDownloadProgress(null)
    }
  }

  // ── Grid classes ────────────────────────────────────────────────────────
  const gridClasses = [
    'grid',
    `grid--${layoutMode}`,
    `grid--spacing-${imageSpacing}`,
    cornerStyle === 'rounded' ? 'grid--corners-rounded' : '',
  ].filter(Boolean).join(' ')

  // ── Footer visibility ──────────────────────────────────────────────────
  const showFooter = showFooterCredit || !!studioName
  const footerText = studioName || txt.deliveredWith

  // ── Should we show stories? ────────────────────────────────────────────
  const showStoriesSection = showStories !== false && stories.length > 0

  // ── Download label (smart: only say "Original" if originals are actually available) ──
  const someOriginalsReady = images.some(img => img.original_path)
  const downloadLabel = isMobile
    ? (downloadQuality === 'original' && someOriginalsReady ? txt.saveOriginal : txt.save)
    : (downloadQuality === 'original' && someOriginalsReady ? txt.downloadOriginal : txt.download)

  // Hero background image: prefer the photographer's chosen cover; otherwise
  // fall back to the first photo of the gallery (heavily blurred + dimmed)
  // so the page never opens as a flat black rectangle.
  const heroFallbackImage = images[0]
  const heroBgUrl = coverUrl
    || (heroFallbackImage ? webUrl(heroFallbackImage) : null)
  const hasCustomCover = !!coverUrl

  // Convert the chosen theme accent (#rrggbb) to "r, g, b" so it can override
  // the existing --accent CSS variable used everywhere in styles.css.
  const themeAccentRgb = (() => {
    const hex = themeAccent.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `${r}, ${g}, ${b}`
  })()

  return (
    <>
      {/* Override the global accent CSS variable to match the photographer's
          chosen theme color. Cascades into every existing rgb(var(--accent)) ref. */}
      <style>{`:root { --accent: ${themeAccentRgb}; }`}</style>
      {/* P4.5.D — Turnstile challenge modal. Renders only when the public-
          gallery-session endpoint returned `turnstile_required` for this IP.
          The widget is invisible 98% of the time (Managed mode); when it does
          show interaction, this overlay frames it. */}
      {turnstileSiteKey && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          background: 'rgba(0,0,0,.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 28px',
            maxWidth: 360, width: '100%', textAlign: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#0a0a0f' }}>
              רגע, מאמתים שאתה לא רובוט
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(0,0,0,.6)' }}>
              זה לוקח שנייה ויעבור אוטומטית.
            </p>
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          </div>
        </div>
      )}
      {/* Hero */}
      {/* Feed mode: mobile sticky header */}
      {isFeedMode && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'linear-gradient(to bottom, rgba(7,7,13,.98), rgba(7,7,13,.92))',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
          padding: '16px 20px', textAlign: 'center',
        }}>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2,
          }}>{galleryTitle}</h1>
          {studioName && (
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', margin: '4px 0 0', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>{studioName}</p>
          )}
        </div>
      )}

      {/* Hero */}
      <header className={`hero ${heroBgUrl ? 'hero--has-bg' : ''} ${hasCustomCover ? 'hero--cover' : 'hero--blurred'}`} style={isFeedMode ? { display: 'none' } : undefined}>
        {heroBgUrl && (
          <div
            className="hero__bg"
            style={{ backgroundImage: `url(${heroBgUrl})` }}
            aria-hidden="true"
          />
        )}
        {heroBgUrl && <div className="hero__overlay" />}
        <div className="hero__content">
          {faceMatchIds && faceSelfieUrl ? (
            /* ── Personalized hero after face search ── */
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', overflow: 'hidden',
                border: '2.5px solid rgba(255,255,255,.18)',
                marginBottom: 16,
                boxShadow: '0 4px 20px rgba(0,0,0,.3), 0 0 0 4px rgba(99,102,241,.12)',
              }}>
                <img src={faceSelfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              {studioName && (
                <p className="hero__eyebrow">{studioName}</p>
              )}
              <h1 className="hero__title" style={{ fontSize: 'clamp(24px, 4vw, 44px)' }}>{galleryTitle}</h1>

              {/* Secured badge for face-search hero */}
              {facePrivacyMode === 'private' && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999, margin: '8px 0 4px',
                  background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.10)',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.65)" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'rgba(34,197,94,.6)' }}>
                    Your photos are protected
                  </span>
                </div>
              )}

              {/* ── Segmented toggle: Your Photos / All Photos ── */}
              <div style={{
                marginTop: 16,
                display: 'inline-flex',
                borderRadius: 999, padding: 3,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.07)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              }}>
                <button
                  onClick={() => setFaceFilterActive(true)}
                  style={{
                    padding: '8px 18px', borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    letterSpacing: '.01em', whiteSpace: 'nowrap',
                    transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                    background: faceFilterActive ? 'rgba(99,102,241,.25)' : 'transparent',
                    color: faceFilterActive ? '#fff' : 'rgba(255,255,255,.4)',
                    boxShadow: faceFilterActive ? '0 1px 6px rgba(99,102,241,.2)' : 'none',
                  }}
                >
                  Your Photos · {faceMatchIds.size}
                </button>
                <button
                  onClick={() => setFaceFilterActive(false)}
                  style={{
                    padding: '8px 18px', borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    letterSpacing: '.01em', whiteSpace: 'nowrap',
                    transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                    background: !faceFilterActive ? 'rgba(255,255,255,.12)' : 'transparent',
                    color: !faceFilterActive ? '#fff' : 'rgba(255,255,255,.4)',
                    boxShadow: !faceFilterActive ? '0 1px 4px rgba(0,0,0,.2)' : 'none',
                  }}
                >
                  All Photos · {images.length}
                </button>
              </div>
            </>
          ) : (
            /* ── Default hero ── */
            <>
              {studioName && (
                <p className="hero__eyebrow">{studioName}</p>
              )}
              <h1 className="hero__title">{galleryTitle}</h1>
              {clientName && (
                <p className="hero__sub">{clientName}</p>
              )}
              <div className="hero__meta">
                <span className="hero__count">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span>
                {(accessType === 'password' || facePrivacyMode === 'private') && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 999, marginLeft: 8,
                    background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.10)',
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const,
                    color: 'rgba(34,197,94,.7)',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Secured
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Unified sticky bar: section pills (left) + download/select toolbar (right) */}
      {(sections.length > 0 || downloadsEnabled || showStoriesSection || faceSearchAvailable) && (
        <SectionNav
          sections={sections.filter(sec => images.some(im => im.section_id === sec.id))}
          sectionCounts={sections.reduce<Record<string, number>>((acc, sec) => {
            acc[sec.id] = images.filter(im => im.section_id === sec.id).length
            return acc
          }, {})}
          showAllPill={false}
          totalCount={images.length}
          activeId={activeSectionView ? `section-${activeSectionView}` : 'all-images'}
          onJump={(id) => {
            // Tapping a section pill SWAPS the visible grid to just that
            // section's photos and resets scroll to the top. Tapping the
            // "All Photos" pill (id === 'all-images') goes back to the
            // stacked-sections layout. Defensive: any unexpected id (e.g.
            // a stale section_id) leaves the rendering untouched.
            const sectionId = id === 'all-images' ? null : id.replace(/^section-/, '')
            setActiveSectionView(sectionId)
            window.scrollTo({ top: 0, behavior: 'auto' })
          }}
          centerToolbar={showStoriesSection ? (
            <button
              className={`gallery-toolbar__btn ${storiesOpen ? 'gallery-toolbar__btn--active' : ''}`}
              onClick={() => setStoriesOpen(v => !v)}
              aria-expanded={storiesOpen}
              aria-controls="gallery-stories"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Stories
              <span className="gallery-toolbar__count">{stories.length}</span>
            </button>
          ) : null}
          toolbar={(faceSearchAvailable || downloadsEnabled) ? (
            <>
              {faceSearchAvailable && !selectMode && !faceMatchIds && (
                <button
                  className="gallery-toolbar__btn"
                  onClick={() => setShowFaceSearch(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="8" r="3" />
                    <path d="M5.5 20a7 7 0 0 1 13 0" />
                  </svg>
                  Find my photos
                </button>
              )}
              {downloadsEnabled && <button
                className={`gallery-toolbar__btn ${selectMode ? 'gallery-toolbar__btn--active' : ''}`}
                onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              >
                {selectMode ? `${selectedIds.size} ${txt.selected}` : txt.select}
              </button>}
              {selectMode && selectedIds.size > 0 && (
                <button
                  className="gallery-toolbar__btn gallery-toolbar__btn--primary"
                  onClick={() => {
                    handleBatchDownload(images.filter(img => selectedIds.has(img.id)))
                    setSelectMode(false); setSelectedIds(new Set())
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {isMobile ? txt.save : txt.download} {selectedIds.size}
                </button>
              )}
              {downloadsEnabled && !selectMode && (
                <button
                  className="gallery-toolbar__btn"
                  onClick={() => handleBatchDownload(images)}
                  disabled={!!dlProgress}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {dlProgress || (isMobile ? txt.saveAll : txt.downloadAll)}
                </button>
              )}
              {selectMode && (
                <button
                  className="gallery-toolbar__btn gallery-toolbar__btn--ghost"
                  onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                >{txt.cancel}</button>
              )}
            </>
          ) : null}
        />
      )}

      {/* Stories — collapsible. Hidden by default; opened from the toolbar.
          Tapping a thumbnail launches the full-screen StoryPlayer overlay
          (Instagram-style); the inline preview keeps autoplay-on-hover so
          guests can sample the clip before committing to full screen. */}
      {showStoriesSection && storiesOpen && (
        <section id="gallery-stories" className="stories">
          <div className="stories__row">
            {stories.map((st, idx) => (
              <div key={st.id} className="story-card">
                <video
                  className="story-card__preview"
                  src={storyUrl(st)}
                  muted
                  playsInline
                  preload="metadata"
                  onClick={() => setStoryPlayerIndex(idx)}
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play story ${st.style}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setStoryPlayerIndex(idx)
                    }
                  }}
                />
                <span className="story-card__name">{st.style}</span>
                <button className="story-card__dl" onClick={() => handleDownload(storyUrl(st), `story_${st.style}.mp4`)}>
                  Download
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full-screen StoryPlayer overlay. Mounted only while a story is
          active; closing returns to the gallery without losing scroll. */}
      {storyPlayerIndex !== null && stories.length > 0 && (
        <StoryPlayer
          stories={stories}
          initialIndex={storyPlayerIndex}
          storyUrl={storyUrl}
          onClose={() => setStoryPlayerIndex(null)}
        />
      )}

      {sections.length > 0 && sections.map(sec => {
        // Single-section view: only render the active section's grid.
        // Switching pills swaps the visible grid by re-running this filter.
        // A section with zero matching images renders null; the all-photos
        // safety-net block below kicks in if every section ends up empty.
        // Face filter applies inside each section: visibleImages is already
        // filtered by faceMatchIds when the filter is on, so each section
        // shows only the matched photos that belong to it. Sections with no
        // matches render null and disappear from the layout. While face
        // filter is on we ignore activeSectionView so matches show across
        // all sections — otherwise a guest who searched their face would
        // only ever see matches inside the currently-pinned section.
        const faceFilterOn = !!(faceMatchIds && faceFilterActive)
        if (activeSectionView && sec.id !== activeSectionView && !faceFilterOn) return null
        const sectionImages = visibleImages.filter(img => img.section_id === sec.id)
        if (sectionImages.length === 0) return null
        return (
          <section key={sec.id} id={`section-${sec.id}`} className="gallery-section">
            <h2 className="gallery-section__heading">
              <span className="gallery-section__name">{sec.name}</span>
              <span className="gallery-section__count">{sectionImages.length} {sectionImages.length === 1 ? 'photo' : 'photos'}</span>
            </h2>
            <MasonryGrid
              images={sectionImages}
              imgBucket={imgBucket}
              layoutMode={layoutMode}
              imageSpacing={imageSpacing}
              cornerStyle={cornerStyle}
              onImageClick={(idx) => {
                // Scope the fullscreen viewer to this section — next/prev
                // stays within the section the user clicked into.
                setViewerList(sectionImages)
                setViewerIndex(idx)
              }}
              onDownload={downloadsEnabled ? handleImageDownload : undefined}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
              clientMode={viewerRole === 'client'}
              hiddenIds={hiddenImageIds}
              onToggleHide={viewerRole === 'client' ? toggleHideImage : undefined}
              favoritedIds={favoritedIds}
              onToggleFavorite={toggleImageFavorite}
              watermark={watermarkEnabled && watermarkText ? { text: watermarkText, position: watermarkPosition } : null}
            />
          </section>
        )
      })}

      {/* All Images section — covers three cases:
          1. The gallery has no sections at all → show every image here.
          2. Sections exist but none contain visible images (sync race or
             post-upload state where section_id is briefly null on every
             row) → show every image here as a safety net.
          3. Sections exist and some images are sectioned but others are
             not → show the unsectioned ones here so they aren't stranded
             off-screen alongside a partially-populated section view.
          Without this the page renders empty whenever any image lacks a
          valid section_id. */}
      {(() => {
        const sectionIdSet = new Set(sections.map(s => s.id))
        const unsectionedImages = visibleImages.filter(img =>
          !img.section_id || !sectionIdSet.has(img.section_id)
        )
        const anySectionHasContent = sections.some(sec =>
          visibleImages.some(img => img.section_id === sec.id)
        )
        const shouldRender =
          sections.length === 0 ||
          !anySectionHasContent ||
          unsectionedImages.length > 0
        if (!shouldRender) return null
        const mainGridImages =
          viewerRole === 'client' ? images :
          sections.length === 0 ? visibleImages :
          unsectionedImages.length > 0 ? unsectionedImages :
          visibleImages
        return (
          <section id="all-images" className="gallery-section gallery-section--all">
            <MasonryGrid
              images={mainGridImages}
              imgBucket={imgBucket}
              layoutMode={layoutMode}
              imageSpacing={imageSpacing}
              cornerStyle={cornerStyle}
              onImageClick={(idx) => {
                setViewerList(mainGridImages)
                setViewerIndex(idx)
              }}
              onDownload={downloadsEnabled ? handleImageDownload : undefined}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
              clientMode={viewerRole === 'client'}
              hiddenIds={hiddenImageIds}
              onToggleHide={viewerRole === 'client' ? toggleHideImage : undefined}
              favoritedIds={favoritedIds}
              onToggleFavorite={toggleImageFavorite}
              watermark={watermarkEnabled && watermarkText ? { text: watermarkText, position: watermarkPosition } : null}
            />
          </section>
        )
      })()}

      {/* Footer */}
      {showFooter && (
        <footer className="footer">
          {studioName && studioWebsite ? (
            <a href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,.15)' }}
            >{studioName}</a>
          ) : footerText}
        </footer>
      )}

      {/* Fullscreen viewer — uses whichever list the clicked tile was in,
          so next/prev navigation stays within that subset (face-match
          results stay filtered; section clicks stay inside the section). */}
      {viewerIndex !== null && (
        <Viewer
          images={viewerList ?? images}
          index={viewerIndex}
          imgBucket={imgBucket}
          allowDownloads={downloadsEnabled}
          downloadLabel={downloadLabel}
          onClose={() => { setViewerIndex(null); setViewerList(null) }}
          onNavigate={setViewerIndex}
          onDownload={handleImageDownload}
          favoritedIds={favoritedIds}
          onToggleFavorite={toggleImageFavorite}
        />
      )}

      {/* Face search — full-screen experience with camera, thinking, results */}
      {showFaceSearch && gallery && (
        <FaceSearchExperience
          galleryId={gallery.id}
          backgroundImages={images.slice(0, 6)}
          storageUrl={(path: string) => storageUrl(imgBucket, path)}
          privacyMode={facePrivacyMode}
          onClose={() => setShowFaceSearch(false)}
          onSelfieCapture={(url) => setFaceSelfieUrl(url)}
          onMatches={(ids, serverImages) => {
            setFaceMatchIds(new Set(ids))
            setFaceFilterActive(true)
            setShowFaceSearch(false)
            if (facePrivacyMode === 'private' && serverImages.length > 0) {
              setImages(serverImages as unknown as GalleryImage[])
            }
            if (showWelcome && ids.length > 0) setShowWelcome(false)
          }}
          onBrowseAll={() => {
            setShowFaceSearch(false)
            if (showWelcome) setShowWelcome(false)
          }}
        />
      )}

      {/* ── HD-still-uploading toast ── */}
      {hdNotice && (
        <div style={{
          position: 'fixed', bottom: isMobile ? 100 : 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 950, padding: '12px 18px', borderRadius: 12,
          background: 'rgba(28,18,4,.95)', border: '1px solid rgba(245,158,11,.35)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          animation: 'fadeIn .25s ease',
        }}>
          <span style={{ fontSize: 16, lineHeight: 1, color: '#f59e0b' }}>⏳</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', lineHeight: 1.5, flex: 1 }}>
            {hdNotice}
          </span>
          <button
            onClick={() => setHdNotice(null)}
            aria-label="Dismiss"
            style={{
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,.45)',
              fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0,
            }}
          >×</button>
        </div>
      )}

      {/* ── Saving photo indicator (mobile) ── */}
      {savingPhoto && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 9999, padding: '20px 32px', borderRadius: 16,
          background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          animation: 'fadeIn .2s ease',
        }}>
          <div className="loader" style={{ width: 20, height: 20 }} />
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{txt.saving}</span>
        </div>
      )}

      {/* ── Download progress overlay ── */}
      {downloadProgress && (
        <div style={{
          position: 'fixed', bottom: isMobile ? 80 : 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900, padding: '12px 24px', borderRadius: 14,
          background: 'rgba(10,10,15,.92)', border: '1px solid rgba(255,255,255,.1)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8,
          minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          animation: 'fadeIn .25s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div className="loader" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 500, flex: 1 }}>
              {dlProgress}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
            </span>
          </div>
          {/* Progress bar */}
          <div style={{
            width: '100%', height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,.08)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(99,102,241,.8), rgba(139,92,246,.8))',
              width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Floating mobile download bar ── */}
      {isMobile && downloadsEnabled && !selectMode && viewerIndex === null && !showFaceSearch && !downloadProgress && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 800,
          padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'rgba(10,10,15,.92)',
          borderTop: '1px solid rgba(255,255,255,.06)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeIn .3s ease',
        }}>
          {/* Device-specific hint */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', margin: 0, lineHeight: 1.4 }}>
              {isIOS
                ? txt.tapToShare
                : txt.tapToSave}
            </p>
          </div>

          {/* Save All button */}
          <button
            onClick={() => handleBatchDownload(faceFilterActive && faceMatchIds ? visibleImages : images)}
            disabled={!!dlProgress}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, rgba(99,102,241,.9), rgba(139,92,246,.9))',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 2px 12px rgba(99,102,241,.25)',
              whiteSpace: 'nowrap' as const, flexShrink: 0,
              transition: 'all .2s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {isIOS ? txt.saveAll : txt.downloadAll}
          </button>
        </div>
      )}
    </>
  )
}
