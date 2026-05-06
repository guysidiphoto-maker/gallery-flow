// FeedStudioPreviews — visual preview cards for the 5 post formats produced by
// Feed Studio Deep. One unified <PostPreview> dispatcher + per-format named
// exports. Visual language matches the existing Workspace cards in
// FeedStudio.tsx (1px border, 8px radius, dark surface, photo on top, body
// below). See docs/FEED_STUDIO_DEEP_ARCHITECTURE.md §2.3, §5.3, §6.
//
// Hard rule (§6): no burned-in text on photos for single / carousel /
// text_slide. ReelCover is the one exception — the hook IS the cover design.
//
// All inline styles via CSSProperties; shared tokens at the bottom of the file.

import type { CSSProperties, JSX } from 'react'
import { storageUrl } from '../supabase'

// ── Types (frozen contracts mirrored from the architecture spec) ─────────
type PostFormat = 'single' | 'carousel' | 'story' | 'reel_cover' | 'text_slide'
type PostStatus = 'draft' | 'scheduled' | 'published'

interface Crop { aspect: '1:1' | '4:5' | '9:16'; focalX: number; focalY: number }

interface BasePost {
  id: string
  position: number | null
  format: PostFormat
  source_gallery_id: string | null
  reasoning: string
  scheduled_at?: string
  status?: PostStatus
}

interface SinglePost extends BasePost {
  format: 'single'
  image_id: string
  caption: string
  crop?: Crop
}

interface CarouselPost extends BasePost {
  format: 'carousel'
  image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  crops?: Record<string, Crop>
}

interface StoryPost extends BasePost {
  format: 'story'
  image_ids: string[]
  slide_meta: Array<{ image_id: string; overlay_text?: string; sticker?: string }>
  crops?: Record<string, Crop>
}

interface ReelCoverPost extends BasePost {
  format: 'reel_cover'
  image_id: string
  hook_text: string
  caption: string
  crop?: Crop
}

interface TextSlidePost extends BasePost {
  format: 'text_slide'
  image_id: null
  headline: string
  sub: string
  background_color: string
  text_color: string
}

type Post = SinglePost | CarouselPost | StoryPost | ReelCoverPost | TextSlidePost

interface TopPick {
  id: string
  gallery_id: string
  thumbnail_path: string | null
  storage_path: string
}

interface Gallery { id: string; name: string }

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  const day = days[d.getDay()]
  const date = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `יום ${day} · ${date}/${month} · ${hh}:${mm}`
}

function imgSrc(img: TopPick | undefined): string | undefined {
  if (!img) return undefined
  return storageUrl('gallery-images', img.thumbnail_path || img.storage_path)
}

function cropFor(crop: Crop | undefined): Crop {
  return crop ?? { aspect: '1:1', focalX: 0.5, focalY: 0.5 }
}

function aspectStr(aspect: Crop['aspect']): string {
  if (aspect === '1:1') return '1/1'
  if (aspect === '4:5') return '4/5'
  return '9/16'
}

// ── Common building blocks ───────────────────────────────────────────────
function StatusPill({ status }: { status: PostStatus }) {
  return (
    <div style={statusPillStyle(status)}>
      <span>{STATUS_DOT[status]}</span>
      <span>{STATUS_LABEL[status]}</span>
    </div>
  )
}

function FormatBadge({ children }: { children: React.ReactNode }) {
  return <div style={formatBadgeStyle}>{children}</div>
}

function CardBody({
  scheduledAt, gallery, children,
}: {
  scheduledAt?: string
  gallery?: Gallery
  children: React.ReactNode
}) {
  return (
    <div style={bodyStyle}>
      <div style={dateLineStyle}>{fmtDate(scheduledAt)}</div>
      <div style={{ marginBottom: 10 }}>{children}</div>
      {gallery && (
        <div style={sourceLineStyle}>מקור: {gallery.name}</div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SINGLE POST — square photo, caption below, source at bottom
// ════════════════════════════════════════════════════════════════════════
export function SinglePostCard({
  post, imageById, galleryById, onClick,
}: {
  post: SinglePost
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  const img = imageById.get(post.image_id)
  const gallery = post.source_gallery_id ? galleryById.get(post.source_gallery_id) : undefined
  const crop = cropFor(post.crop)
  const status = (post.status ?? 'draft') as PostStatus
  const aspect = aspectStr(crop.aspect)
  const src = imgSrc(img)

  return (
    <div onClick={onClick} style={cardStyle(!!onClick)}>
      <div style={{ aspectRatio: aspect, position: 'relative', background: '#000' }}>
        {src && (
          <img
            src={src}
            alt=""
            style={photoStyle(crop.focalX, crop.focalY)}
          />
        )}
        <StatusPill status={status} />
      </div>
      <CardBody scheduledAt={post.scheduled_at} gallery={gallery}>
        <div style={captionStyle}>{post.caption}</div>
      </CardBody>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// CAROUSEL POST — stacked deck of 3 photo tiles, opening caption below
// ════════════════════════════════════════════════════════════════════════
export function CarouselPostCard({
  post, imageById, galleryById, onClick,
}: {
  post: CarouselPost
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  const gallery = post.source_gallery_id ? galleryById.get(post.source_gallery_id) : undefined
  const status = (post.status ?? 'draft') as PostStatus
  const slideCount = post.image_ids.length
  const deckIds = post.image_ids.slice(0, 3)
  // Render the bottom of the deck first, top last (so it visually overlays).
  const deckImages = deckIds.map(id => imageById.get(id)).reverse()

  return (
    <div onClick={onClick} style={cardStyle(!!onClick)}>
      <div style={{
        aspectRatio: '1/1', position: 'relative',
        background: 'rgba(255,255,255,.02)', overflow: 'hidden',
      }}>
        {/* Stacked deck: 3 tiles, each offset by 8px diagonally. */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {deckImages.map((img, i) => {
            // i=0 is the bottom of the deck (most offset), i=2 is the top tile.
            const depthFromTop = deckImages.length - 1 - i
            const offset = depthFromTop * 8
            const src = imgSrc(img)
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: '70%', aspectRatio: '1/1',
                  transform: `translate(${offset}px, ${offset}px)`,
                  background: '#000',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,.45)',
                }}
              >
                {src && (
                  <img
                    src={src}
                    alt=""
                    style={photoStyle(0.5, 0.5)}
                  />
                )}
              </div>
            )
          })}
        </div>
        <FormatBadge>🎴 קרוסלה · {slideCount} שקופיות</FormatBadge>
        <StatusPill status={status} />
      </div>
      <CardBody scheduledAt={post.scheduled_at} gallery={gallery}>
        <div style={captionStyle}>{post.opening_caption}</div>
      </CardBody>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// STORY POST — 9:16 phone mockup with story dots row + first slide
// ════════════════════════════════════════════════════════════════════════
export function StoryPostCard({
  post, imageById, galleryById, onClick,
}: {
  post: StoryPost
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  const gallery = post.source_gallery_id ? galleryById.get(post.source_gallery_id) : undefined
  const status = (post.status ?? 'draft') as PostStatus
  const slideCount = post.image_ids.length
  const firstId = post.image_ids[0]
  const firstImg = firstId ? imageById.get(firstId) : undefined
  const firstCrop = firstId && post.crops ? post.crops[firstId] : undefined
  const crop = cropFor(firstCrop)
  const src = imgSrc(firstImg)

  return (
    <div onClick={onClick} style={cardStyle(!!onClick)}>
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #16161e 0%, #0c0c12 100%)',
        padding: '14px 0 10px',
        display: 'flex', justifyContent: 'center',
      }}>
        {/* Phone mockup */}
        <div style={{
          width: '62%', aspectRatio: '9/16',
          background: '#000',
          border: '2px solid rgba(255,255,255,.18)',
          borderRadius: 14,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 12px 28px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4)',
        }}>
          {/* Status bar dots (top) */}
          <div style={{
            position: 'absolute', top: 4, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 4,
            zIndex: 3,
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 3, height: 3, borderRadius: 2,
                background: 'rgba(255,255,255,.55)',
              }} />
            ))}
          </div>
          {/* Story-dots row showing slide count */}
          <div style={{
            position: 'absolute', top: 12, left: 6, right: 6,
            display: 'flex', gap: 3, zIndex: 3,
          }}>
            {Array.from({ length: Math.max(slideCount, 1) }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 2, borderRadius: 1,
                background: i === 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)',
              }} />
            ))}
          </div>
          {/* First slide photo (full-bleed) */}
          {src && (
            <img
              src={src}
              alt=""
              style={photoStyle(crop.focalX, crop.focalY)}
            />
          )}
          {!src && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,.3)', fontSize: 11,
            }}>—</div>
          )}
        </div>
        <FormatBadge>📱 סטורי · {slideCount} שקופיות</FormatBadge>
        <StatusPill status={status} />
      </div>
      <CardBody scheduledAt={post.scheduled_at} gallery={gallery}>
        <div style={captionStyle}>
          {slideCount} שקופיות סטורי · 24 שעות
        </div>
      </CardBody>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// REEL COVER — 9:16 vertical with hook overlay (allowed: it's a cover)
// ════════════════════════════════════════════════════════════════════════
export function ReelCoverPostCard({
  post, imageById, galleryById, onClick,
}: {
  post: ReelCoverPost
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  const img = imageById.get(post.image_id)
  const gallery = post.source_gallery_id ? galleryById.get(post.source_gallery_id) : undefined
  const crop = cropFor(post.crop)
  const status = (post.status ?? 'draft') as PostStatus
  const src = imgSrc(img)

  return (
    <div onClick={onClick} style={cardStyle(!!onClick)}>
      <div style={{ aspectRatio: '9/16', position: 'relative', background: '#000' }}>
        {src && (
          <img
            src={src}
            alt=""
            style={photoStyle(crop.focalX, crop.focalY)}
          />
        )}
        {/* Bottom gradient so hook reads on bright photos */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: '55%',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 60%, rgba(0,0,0,.75) 100%)',
          pointerEvents: 'none',
        }} />
        {/* Hook text — large, centered, bottom area */}
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 22,
          textAlign: 'center',
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: 22, fontWeight: 700, lineHeight: 1.2,
          color: '#fff',
          textShadow: '0 2px 8px rgba(0,0,0,.6)',
        }}>
          {post.hook_text}
        </div>
        <FormatBadge>🎬 ריל</FormatBadge>
        <StatusPill status={status} />
      </div>
      <CardBody scheduledAt={post.scheduled_at} gallery={gallery}>
        <div style={captionStyle}>{post.caption}</div>
      </CardBody>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// TEXT SLIDE — designed text card, no photo
// ════════════════════════════════════════════════════════════════════════
export function TextSlidePostCard({
  post, galleryById, onClick,
}: {
  post: TextSlidePost
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  const gallery = post.source_gallery_id ? galleryById.get(post.source_gallery_id) : undefined
  const status = (post.status ?? 'draft') as PostStatus

  return (
    <div onClick={onClick} style={cardStyle(!!onClick)}>
      <div style={{
        aspectRatio: '1/1', position: 'relative',
        background: post.background_color,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 18px', textAlign: 'center',
      }}>
        <div style={{
          color: post.text_color,
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: 26, fontWeight: 800, lineHeight: 1.15,
          letterSpacing: '-0.01em',
          marginBottom: 10,
        }}>
          {post.headline}
        </div>
        <div style={{
          color: post.text_color,
          opacity: 0.7,
          fontSize: 13, lineHeight: 1.5, fontWeight: 500,
        }}>
          {post.sub}
        </div>
        <FormatBadge>✨ שקופית טקסט</FormatBadge>
        <StatusPill status={status} />
      </div>
      <CardBody scheduledAt={post.scheduled_at} gallery={gallery}>
        <div style={captionStyle}>{post.headline}</div>
      </CardBody>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// DISPATCHER — picks the right card by post.format
// ════════════════════════════════════════════════════════════════════════
export function PostPreview({
  post, imageById, galleryById, onClick,
}: {
  post: Post
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
}): JSX.Element {
  // Legacy plans (pre-deep migration) had posts without a `format` field —
  // they were always single-photo. Treat undefined as 'single' so old rows
  // still render instead of disappearing silently.
  const fmt = post.format ?? 'single'
  switch (fmt) {
    case 'single':
      return <SinglePostCard post={post as SinglePost} imageById={imageById} galleryById={galleryById} onClick={onClick} />
    case 'carousel':
      return <CarouselPostCard post={post as CarouselPost} imageById={imageById} galleryById={galleryById} onClick={onClick} />
    case 'story':
      return <StoryPostCard post={post as StoryPost} imageById={imageById} galleryById={galleryById} onClick={onClick} />
    case 'reel_cover':
      return <ReelCoverPostCard post={post as ReelCoverPost} imageById={imageById} galleryById={galleryById} onClick={onClick} />
    case 'text_slide':
      return <TextSlidePostCard post={post as TextSlidePost} galleryById={galleryById} onClick={onClick} />
  }
  // Final fallback — should be unreachable.
  return <SinglePostCard post={post as SinglePost} imageById={imageById} galleryById={galleryById} onClick={onClick} />
}

// ── Shared style tokens (mirrors FeedStudio.tsx Workspace cards) ─────────
const STATUS_LABEL: Record<PostStatus, string> = {
  draft:     'טיוטה',
  scheduled: 'מתוזמן',
  published: 'פורסם',
}

const STATUS_COLOR: Record<PostStatus, string> = {
  draft:     'rgba(255,255,255,.45)',
  scheduled: '#D4FF00',
  published: '#3DDC84',
}

const STATUS_DOT: Record<PostStatus, string> = {
  draft:     '📝',
  scheduled: '⏱',
  published: '✅',
}

function cardStyle(clickable: boolean): CSSProperties {
  return {
    width: 260,
    background: 'rgba(255,255,255,.03)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    direction: 'rtl',
    color: 'rgba(255,255,255,.92)',
    cursor: clickable ? 'pointer' : 'default',
  }
}

function photoStyle(focalX: number, focalY: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
  }
}

function statusPillStyle(status: PostStatus): CSSProperties {
  return {
    position: 'absolute',
    top: 8, right: 8,
    fontSize: 11, fontWeight: 700, padding: '4px 9px',
    background: 'rgba(0,0,0,.65)', borderRadius: 4,
    color: STATUS_COLOR[status], letterSpacing: '.04em',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    zIndex: 4,
  }
}

const formatBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 8, left: 8,
  fontSize: 11, fontWeight: 700,
  padding: '4px 9px',
  background: 'rgba(0,0,0,.65)',
  borderRadius: 4,
  color: '#fff',
  letterSpacing: '.02em',
  zIndex: 4,
}

const bodyStyle: CSSProperties = {
  padding: '12px 14px 14px',
}

const dateLineStyle: CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,.5)',
  marginBottom: 6,
  fontWeight: 600,
  letterSpacing: '.04em',
}

const captionStyle: CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,.88)',
  lineHeight: 1.5,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const sourceLineStyle: CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,.4)',
  paddingTop: 8,
  borderTop: '1px solid rgba(255,255,255,.05)',
}
