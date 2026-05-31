// ─── LocalGalleryPreview — in-process preview pane ───────────────────────
//
// Replaces the dashboard's old iframe-based "תצוגה חיה ללקוח" pane. Every
// settings change used to:
//   1. write to Supabase (200-500 ms)
//   2. bump previewRefreshKey → swap the iframe DOM → full document reload
//   3. browser fetches HTML + JS + CSS + every image from the CDN
//   4. App.tsx mounts, re-fetches the gallery, re-renders, re-loads images
// …per keystroke. This component renders the WelcomeScreen + a simplified
// chapter grid IN-PROCESS, reading from local React state. The DB write
// still happens (debounced by updateGallerySetting), but the preview
// updates instantly — no network involved.
//
// We deliberately render a SUBSET of the public viewer chrome:
//   - WelcomeScreen (the dominant editor surface, full fidelity)
//   - A miniaturized chapter grid (sections + first few thumbs each), useful
//     for layout / typography sanity, not pixel-accurate
// The preview pane is labelled "תצוגה מקומית" so the photographer knows
// it's a simulation of unsaved local state, not what visitors see live.

import { useMemo } from 'react'
import { WelcomeScreen } from './PreviewSurfaces'
import { storageUrl, renderUrl } from '../supabase'
import type { GalleryImage as TypesGalleryImage } from '../types'

// Minimal duck-typed shapes — Dashboard.tsx defines its own local Gallery /
// GalleryImage interfaces that overlap with `../types` but aren't identical
// (no client_name / event_date on the dashboard Gallery; thumbnail_path may
// be null). Accepting structural minimums keeps the preview component
// callable from both surfaces without forcing a refactor of Dashboard's
// internal types.
export interface PreviewGallery {
  id: string
  name: string
  slug?: string | null
  client_name?: string | null
  delivery_settings?: Record<string, unknown> | null
  demo_expires_at?: string | null
  event_date?: string | null
  event_location?: string | null
}

export interface PreviewImage {
  id: string
  storage_path: string
  thumbnail_path?: string | null
  section_id?: string | null
  is_top_pick?: boolean
  width?: number | null
  height?: number | null
}

export interface PreviewSection {
  id: string
  name: string
  description?: string | null
}

export interface LocalGalleryPreviewProps {
  gallery: PreviewGallery
  sections: PreviewSection[]
  images: PreviewImage[]
  /** Which surface to render. `welcome` shows the WelcomeScreen.
   *  `feed` shows a stacked-chapter mini grid (each section + thumbs). */
  mode?: 'welcome' | 'feed'
}

// Natural viewer width — matches the desktop-class breakpoint the public
// viewer targets. We render at this width then scale down so a desktop-shaped
// preview fits into ~540px without distortion.
const NATURAL_WIDTH = 1440
const PANE_WIDTH = 540
const SCALE = PANE_WIDTH / NATURAL_WIDTH

export function LocalGalleryPreview({
  gallery,
  sections,
  images,
  mode = 'welcome',
}: LocalGalleryPreviewProps) {
  // Resolve settings the same way App.tsx does — JSONB delivery_settings
  // is the source of truth on the client side. Demo galleries store their
  // images in a different bucket; mirror that detection here.
  const raw = (gallery.delivery_settings || {}) as Record<string, unknown>
  const isDemoGallery = !!gallery?.demo_expires_at
  const imgBucket = isDemoGallery ? 'demo-uploads' : 'gallery-images'

  const galleryTitle = (raw.galleryTitle as string) || gallery.name
  const clientName = (raw.clientName as string) || gallery.client_name || ''
  const galleryDescription = (raw.galleryDescription as string) || ''
  const welcomeMessage = (raw.welcomeMessage as string) || ''
  const textAnimation = (raw.welcomeTextAnimation as 'blur' | 'typewriter' | 'slide') || 'blur'
  const animationSpeed = (raw.welcomeAnimationSpeed as 'slow' | 'normal' | 'fast') || 'normal'
  const eventDate = (gallery.event_date ?? (raw.eventDate as string) ?? '') as string
  const eventLocation = (gallery.event_location ?? (raw.eventLocation as string) ?? '') as string
  const studioName = (raw.studioName as string) || ''
  const studioWebsite = (raw.studioWebsite as string) || ''
  const headingFont = ((raw.headingFont as string) || '').trim()
  const bodyFont = ((raw.bodyFont as string) || '').trim()

  const welcomeStyle: 'mosaic' | 'cinematic' | 'minimal' =
    (raw.welcomeStyle as 'mosaic' | 'cinematic' | 'minimal') || 'mosaic'

  const coverImageUrl = (raw.coverImageUrl as string | null) ||
    (raw.coverImagePath ? storageUrl(imgBucket, raw.coverImagePath as string) : null)
  const coverCrop = (raw.coverCrop as { zoom: number; x: number; y: number } | null) ?? null

  // Mosaic / cinematic background needs a handful of representative thumbs.
  // Same TARGET as App.tsx so the visual density matches. WelcomeScreen is
  // typed against `GalleryImage` from `../types`; PreviewImage is a subset
  // of that shape (no filename / sort_order — neither is read by the welcome
  // surface) so we cast the entire result at the boundary.
  const welcomeImages = useMemo<TypesGalleryImage[]>(() => {
    const TARGET = 30
    const topPicks = images.filter(im => im.is_top_pick)
    const pick = (arr: PreviewImage[]): PreviewImage[] => arr.slice(0, TARGET)
    if (topPicks.length > 0) return pick(topPicks) as unknown as TypesGalleryImage[]
    if (sections.length <= 1) return pick(images) as unknown as TypesGalleryImage[]
    const perSection = Math.ceil(TARGET / sections.length)
    const result: PreviewImage[] = []
    for (const sec of sections) {
      const secImgs = images.filter(im => im.section_id === sec.id)
      result.push(...secImgs.slice(0, perSection))
    }
    const unsectioned = images.filter(im => !im.section_id)
    result.push(...unsectioned.slice(0, Math.max(0, TARGET - result.length)))
    return pick(result) as unknown as TypesGalleryImage[]
  }, [images, sections])

  // Stable URL resolver — for the welcome screen we use the WEB preview at
  // a small width because the mosaic columns are tiny.
  const getUrl = (path: string) => renderUrl(imgBucket, path, 720, 65)

  // ── Scale + crop wrapper ────────────────────────────────────────────
  // Render at 1440px then scale to fit the side pane. transform: scale uses
  // GPU compositing so it stays smooth as the React tree re-renders.
  const wrapper: React.CSSProperties = {
    width: NATURAL_WIDTH,
    height: 900,
    transform: `scale(${SCALE})`,
    transformOrigin: 'top right',
    position: 'relative',
    overflow: 'hidden',
    // Pointer events off — this is a preview, not a working surface.
    // Prevents accidental Enter-gallery clicks while editing settings.
    pointerEvents: 'none',
  }

  // The WelcomeScreen uses `position: fixed; inset: 0` which would normally
  // cover the whole document. We give the preview a relative container with
  // an absolute inset so `fixed` is contained to this rectangle (via
  // `contain: paint` — supported in all evergreen browsers).
  const containedFixed: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    contain: 'layout paint size style',
  }

  return (
    <div
      style={{
        width: PANE_WIDTH,
        height: 540,
        overflow: 'hidden',
        background: '#000',
        position: 'relative',
      }}
      aria-label="תצוגה מקומית של מסך הפתיחה"
      role="img"
    >
      <div style={wrapper}>
        <div style={containedFixed}>
          {mode === 'welcome' ? (
            <WelcomeScreen
              style={welcomeStyle}
              galleryTitle={galleryTitle}
              galleryDescription={galleryDescription}
              welcomeMessage={welcomeMessage}
              textAnimation={textAnimation}
              animationSpeed={animationSpeed}
              eventDate={eventDate}
              eventLocation={eventLocation}
              clientName={clientName}
              studioName={studioName}
              studioWebsite={studioWebsite}
              images={welcomeImages}
              coverImageUrl={coverImageUrl}
              coverCrop={coverCrop}
              storageUrl={getUrl}
              onEnter={() => { /* preview only — no navigation */ }}
              faceSearchAvailable={false}
              facePrivacyMode={null}
              onFindMyPhotos={() => { /* preview only */ }}
              lang="he"
              headingFont={headingFont || undefined}
              bodyFont={bodyFont || undefined}
            />
          ) : (
            <FeedPreview
              sections={sections}
              images={images}
              imgBucket={imgBucket}
              galleryTitle={galleryTitle}
              headingFont={headingFont || undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Simplified chapter / feed grid ──────────────────────────────────────
// Not pixel-accurate to the public viewer (no virtualization, no scroll-spy,
// no signed URLs). Goal is to give the photographer a feel for the typography
// + layout choices without paying the cost of a full viewer mount.

function FeedPreview({
  sections,
  images,
  imgBucket,
  galleryTitle,
  headingFont,
}: {
  sections: PreviewSection[]
  images: PreviewImage[]
  imgBucket: string
  galleryTitle: string
  headingFont?: string
}) {
  const visibleSections = sections.filter(sec =>
    images.some(im => im.section_id === sec.id)
  )
  const PER_SECTION = 9 // 3 cols × 3 rows preview tile per chapter
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: '#fafaf8',
        color: '#141413',
        padding: '40px 48px',
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 600,
          margin: '0 0 8px',
          letterSpacing: '-0.02em',
          fontFamily: headingFont ? `'${headingFont}', inherit` : undefined,
        }}
      >
        {galleryTitle}
      </h1>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          opacity: 0.45,
          marginBottom: 36,
        }}
      >
        Preview · stacked chapters
      </div>
      {visibleSections.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 14 }}>אין סקשנים עם תמונות עדיין.</div>
      ) : (
        visibleSections.map(sec => {
          const secImages = images
            .filter(im => im.section_id === sec.id)
            .slice(0, PER_SECTION)
          return (
            <section key={sec.id} style={{ marginBottom: 56 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  margin: '0 0 4px',
                  letterSpacing: '-0.01em',
                  fontFamily: headingFont ? `'${headingFont}', inherit` : undefined,
                }}
              >
                {sec.name}
              </h2>
              {sec.description && (
                <p style={{ fontSize: 12, opacity: 0.6, margin: '0 0 16px' }}>
                  {sec.description}
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                }}
              >
                {secImages.map(im => (
                  <div
                    key={im.id}
                    style={{
                      aspectRatio:
                        im.width && im.height
                          ? `${im.width} / ${im.height}`
                          : '3 / 2',
                      background:
                        'linear-gradient(135deg, rgba(0,0,0,.04), rgba(0,0,0,.1))',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={renderUrl(
                        imgBucket,
                        im.thumbnail_path || im.storage_path,
                        480,
                        60,
                      )}
                      alt=""
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
