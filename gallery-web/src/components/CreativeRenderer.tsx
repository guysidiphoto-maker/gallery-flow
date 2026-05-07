// CreativeRenderer — composes a DesignSpec into a real visual.
//
// Each layout is a hand-coded React component that takes the spec + the
// direction's design tokens and renders a 1080×1080 (or proportional)
// composition. The renderer DOES NOT pick fonts, colors, or layouts — those
// come from the AI's chosen direction. The renderer's only job is to make
// the design look like an agency made it: typography hierarchy, negative
// space, alignment, blend modes.
//
// All compositions render at a virtual 1080px coordinate system. The outer
// container scales them to whatever pixel size the caller asks for via the
// `displaySize` prop, so previews can be small but exports can be 1080.

import { useMemo, type CSSProperties } from 'react'
import { storageUrl } from '../supabase'

// ─── Design tokens (mirror /api/generate-campaign.ts DIRECTIONS) ────────
export interface DirectionTokens {
  bg_color: string
  text_color: string
  primary_color: string
  accent_color: string
  font_display: string
  font_body: string
  typography_scale: 'minimal' | 'balanced' | 'dominant'
  grain?: number   // 0 or 1 — light film-grain overlay for moody directions
}

export type LayoutId =
  | 'headline-overlay'
  | 'color-block-frame'
  | 'split-tile-3'
  | 'typography-poster'
  | 'magazine-spread'
  | 'duotone-portrait'

export interface DesignSpec {
  id: string
  layout: LayoutId
  image_id?: string
  image_ids?: string[]
  crop?: { focalX: number; focalY: number }
  headline: string
  sub?: string
  caption?: string
  align?: 'top' | 'center' | 'bottom'
}

export interface TopPick {
  id: string
  thumbnail_path: string | null
  storage_path: string
}

interface RendererProps {
  spec: DesignSpec
  tokens: DirectionTokens
  imageById: Map<string, TopPick>
  /** Square dimension in CSS px the composition should display at (default 480). */
  displaySize?: number
  /** Capture-root id, useful for html2canvas exports per post. */
  captureId?: string
}

// Virtual canvas size all internal coordinates use.
const CANVAS = 1080

// Type-scale modifier per direction (multiplier on the per-layout base).
const SCALE_FACTOR: Record<DirectionTokens['typography_scale'], number> = {
  minimal: 0.86,
  balanced: 1.0,
  dominant: 1.18,
}

/** Top-level dispatcher. Picks the right layout, scales it down to display
  * size, and wraps it for html2canvas capture. */
export function CreativeRenderer({
  spec, tokens, imageById, displaySize = 480, captureId,
}: RendererProps) {
  const scale = displaySize / CANVAS
  const aspect = layoutAspect(spec.layout)

  // For 9:16 layouts the height is taller than width.
  const widthPx  = displaySize
  const heightPx = displaySize / aspect.w * aspect.h

  // The inner element always uses the virtual 1080-wide canvas; we transform
  // it down to the displaySize via CSS scale. This keeps every coordinate
  // inside a single component at 1080-resolution math.
  const inner = (() => {
    switch (spec.layout) {
      case 'headline-overlay':
        return <HeadlineOverlay spec={spec} tokens={tokens} imageById={imageById} />
      case 'color-block-frame':
        return <ColorBlockFrame spec={spec} tokens={tokens} imageById={imageById} />
      case 'split-tile-3':
        return <SplitTile3 spec={spec} tokens={tokens} imageById={imageById} />
      case 'typography-poster':
        return <TypographyPoster spec={spec} tokens={tokens} />
      case 'magazine-spread':
        return <MagazineSpread spec={spec} tokens={tokens} imageById={imageById} />
      case 'duotone-portrait':
        return <DuotonePortrait spec={spec} tokens={tokens} imageById={imageById} />
    }
  })()

  return (
    <div style={{
      width: widthPx, height: heightPx,
      overflow: 'hidden', position: 'relative',
      background: tokens.bg_color,
      borderRadius: 8,
    }}>
      <div
        id={captureId}
        style={{
          width: aspect.w * CANVAS / aspect.w, // == CANVAS for square; smaller for 9:16
          height: aspect.h * CANVAS / aspect.w,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: tokens.bg_color,
          fontFamily: tokens.font_body,
          color: tokens.text_color,
          position: 'relative',
        }}
      >
        {inner}
      </div>
    </div>
  )
}

function layoutAspect(layout: LayoutId): { w: number; h: number } {
  // Most IG feed posts are 1:1 or 4:5. Carousels keep 1:1 per slide.
  switch (layout) {
    case 'split-tile-3':
      return { w: 3, h: 1 }   // 3 slides side-by-side preview (3:1)
    case 'magazine-spread':
      return { w: 1, h: 1 }   // 1:1 with two columns inside
    default:
      return { w: 1, h: 1 }
  }
}

// ════════════════════════════════════════════════════════════════════════
// Layout: headline-overlay — full-bleed photo with giant headline
// ════════════════════════════════════════════════════════════════════════
function HeadlineOverlay({
  spec, tokens, imageById,
}: { spec: DesignSpec; tokens: DirectionTokens; imageById: Map<string, TopPick> }) {
  const img = spec.image_id ? imageById.get(spec.image_id) : undefined
  const focal = spec.crop ?? { focalX: 0.5, focalY: 0.5 }
  const align = spec.align ?? 'bottom'
  const baseSize = 116
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]

  // Gradient overlay direction depends on text position (always darker
  // behind the headline so it reads).
  const gradient =
    align === 'bottom' ? 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.6) 100%)'
    : align === 'top'  ? 'linear-gradient(0deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.6) 100%)'
                       : 'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)'

  return (
    <>
      {img && (
        <img
          src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
          alt=""
          loading="lazy"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: `${focal.focalX * 100}% ${focal.focalY * 100}%`,
          }}
        />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: gradient,
        pointerEvents: 'none',
      }} />
      {tokens.grain ? <Grain /> : null}
      <div style={{
        position: 'absolute', inset: 0,
        padding: 76,
        display: 'flex', flexDirection: 'column',
        justifyContent: align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center',
        color: '#fafafa',
        direction: 'rtl', textAlign: 'right',
      }}>
        <h1 style={{
          fontFamily: tokens.font_display,
          fontSize: headlineSize, fontWeight: 800,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          margin: 0,
          textShadow: '0 4px 20px rgba(0,0,0,.5)',
        }}>{spec.headline}</h1>
        {spec.sub && (
          <p style={{
            marginTop: 36, fontSize: 32, fontWeight: 400,
            lineHeight: 1.35, opacity: 0.92, maxWidth: 720,
            fontStyle: tokens.font_display.includes('serif') ? 'italic' : 'normal',
          }}>{spec.sub}</p>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Layout: color-block-frame — photo with thick solid border + caption below
// ════════════════════════════════════════════════════════════════════════
function ColorBlockFrame({
  spec, tokens, imageById,
}: { spec: DesignSpec; tokens: DirectionTokens; imageById: Map<string, TopPick> }) {
  const img = spec.image_id ? imageById.get(spec.image_id) : undefined
  const focal = spec.crop ?? { focalX: 0.5, focalY: 0.5 }
  const baseSize = 88
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]
  const photoTop = 96
  const photoSize = 720
  const photoLeft = (CANVAS - photoSize) / 2

  return (
    <>
      <div style={{
        position: 'absolute',
        top: photoTop, left: photoLeft, width: photoSize, height: photoSize,
        overflow: 'hidden',
        boxShadow: `0 0 0 8px ${tokens.bg_color}`,
      }}>
        {img && (
          <img
            src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
            alt=""
            loading="lazy"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: `${focal.focalX * 100}% ${focal.focalY * 100}%`,
            }}
          />
        )}
      </div>
      {/* Accent line */}
      <div style={{
        position: 'absolute', left: photoLeft, top: photoTop + photoSize + 36,
        width: 80, height: 3, background: tokens.accent_color,
      }} />
      {/* Headline below */}
      <div style={{
        position: 'absolute',
        top: photoTop + photoSize + 64,
        left: photoLeft, width: photoSize,
        direction: 'rtl', textAlign: 'right',
        color: tokens.text_color,
        fontFamily: tokens.font_display,
      }}>
        <h2 style={{
          fontSize: headlineSize, fontWeight: 800,
          letterSpacing: '-0.025em', lineHeight: 1.0,
          margin: 0,
        }}>{spec.headline}</h2>
        {spec.caption && (
          <p style={{
            marginTop: 18, fontSize: 24, lineHeight: 1.45, opacity: 0.7,
            fontFamily: tokens.font_body,
          }}>{spec.caption}</p>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Layout: split-tile-3 — same image split across 3 carousel slides
// ════════════════════════════════════════════════════════════════════════
function SplitTile3({
  spec, tokens, imageById,
}: { spec: DesignSpec; tokens: DirectionTokens; imageById: Map<string, TopPick> }) {
  const img = spec.image_ids && spec.image_ids[0] ? imageById.get(spec.image_ids[0]) : undefined
  const slideW = CANVAS // each slide renders at CANVAS-wide; we show 3 side-by-side
  const baseSize = 88
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]

  // The aspect of THIS layout's outer is 3:1, so the canvas is 3*CANVAS wide,
  // CANVAS tall. We render 3 stacked slides each 1080×1080.
  return (
    <div style={{
      position: 'relative', width: CANVAS * 3, height: CANVAS,
      display: 'flex', flexDirection: 'row',
    }}>
      {[0, 1, 2].map(slide => (
        <div key={slide} style={{
          position: 'relative', width: slideW, height: CANVAS,
          overflow: 'hidden',
          borderInlineEnd: slide < 2 ? `2px solid ${tokens.bg_color}` : 'none',
        }}>
          {img && (
            <img
              src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
              alt=""
              loading="lazy"
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '300%', height: '100%',
                objectFit: 'cover',
                transform: `translateX(${-slide * 100}%)`,
              }}
            />
          )}
          {slide === 0 && spec.headline && (
            <div style={{
              position: 'absolute', inset: 0, padding: 72,
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              direction: 'rtl', textAlign: 'right',
              color: '#fafafa',
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)',
            }}>
              <h2 style={{
                fontFamily: tokens.font_display,
                fontSize: headlineSize, fontWeight: 800, letterSpacing: '-0.025em',
                lineHeight: 1.0, margin: 0,
                textShadow: '0 4px 20px rgba(0,0,0,.5)',
              }}>{spec.headline}</h2>
            </div>
          )}
          {/* Slide indicator */}
          <div style={{
            position: 'absolute', top: 24, insetInlineEnd: 24,
            padding: '8px 18px', borderRadius: 24,
            background: 'rgba(0,0,0,.55)', color: '#fff',
            fontFamily: tokens.font_body, fontSize: 22, fontWeight: 700,
            letterSpacing: '.04em',
          }}>{slide + 1} / 3</div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Layout: typography-poster — NO photo. Designed text on color background.
// ════════════════════════════════════════════════════════════════════════
function TypographyPoster({
  spec, tokens,
}: { spec: DesignSpec; tokens: DirectionTokens }) {
  const baseSize = 144
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]
  return (
    <>
      {/* Decorative element top — large accent square (low opacity) */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: 240, height: 240,
        background: tokens.accent_color, opacity: 0.18,
      }} />
      {/* Decorative diagonal accent line */}
      <div style={{
        position: 'absolute', bottom: 80, insetInlineStart: 76, width: 540, height: 4,
        background: tokens.accent_color,
      }} />
      <div style={{
        position: 'absolute', inset: 0, padding: 88,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        direction: 'rtl', textAlign: 'right',
      }}>
        <div style={{
          fontFamily: tokens.font_body,
          fontSize: 22, letterSpacing: '.32em', textTransform: 'uppercase',
          color: tokens.accent_color, fontWeight: 700,
          marginBottom: 32,
        }}>● Pixflow Editorial</div>
        <h1 style={{
          fontFamily: tokens.font_display,
          fontSize: headlineSize, fontWeight: 800,
          lineHeight: 0.92, letterSpacing: '-0.035em',
          margin: 0, color: tokens.text_color,
        }}>{spec.headline}</h1>
        {spec.sub && (
          <p style={{
            fontFamily: tokens.font_body,
            marginTop: 56, fontSize: 30, lineHeight: 1.5,
            color: tokens.text_color, opacity: 0.7,
            maxWidth: 760,
            fontStyle: tokens.font_display.includes('serif') ? 'italic' : 'normal',
          }}>{spec.sub}</p>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Layout: magazine-spread — portrait + headline beside it
// ════════════════════════════════════════════════════════════════════════
function MagazineSpread({
  spec, tokens, imageById,
}: { spec: DesignSpec; tokens: DirectionTokens; imageById: Map<string, TopPick> }) {
  const img = spec.image_id ? imageById.get(spec.image_id) : undefined
  const focal = spec.crop ?? { focalX: 0.5, focalY: 0.45 }
  const baseSize = 96
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]
  const photoW = 540

  return (
    <>
      {/* Photo on the right (RTL means start = right) */}
      <div style={{
        position: 'absolute', top: 0, insetInlineEnd: 0,
        width: photoW, height: CANVAS, overflow: 'hidden',
      }}>
        {img && (
          <img
            src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
            alt=""
            loading="lazy"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: `${focal.focalX * 100}% ${focal.focalY * 100}%`,
            }}
          />
        )}
        {tokens.grain ? <Grain /> : null}
      </div>
      {/* Headline on the left */}
      <div style={{
        position: 'absolute', top: 0, insetInlineStart: 0,
        width: CANVAS - photoW - 60, height: CANVAS,
        padding: '120px 80px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        direction: 'rtl', textAlign: 'right',
      }}>
        <div style={{
          fontFamily: tokens.font_body,
          fontSize: 22, letterSpacing: '.32em', textTransform: 'uppercase',
          color: tokens.accent_color, fontWeight: 700, marginBottom: 24,
        }}>— מגזין</div>
        <h1 style={{
          fontFamily: tokens.font_display,
          fontSize: headlineSize, fontWeight: 800,
          lineHeight: 0.96, letterSpacing: '-0.03em',
          margin: 0, color: tokens.text_color,
        }}>{spec.headline}</h1>
        {spec.sub && (
          <p style={{
            fontFamily: tokens.font_body,
            marginTop: 36, fontSize: 26, lineHeight: 1.5,
            color: tokens.text_color, opacity: 0.72,
            fontStyle: tokens.font_display.includes('serif') ? 'italic' : 'normal',
          }}>{spec.sub}</p>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Layout: duotone-portrait — photo with duotone color treatment
// ════════════════════════════════════════════════════════════════════════
function DuotonePortrait({
  spec, tokens, imageById,
}: { spec: DesignSpec; tokens: DirectionTokens; imageById: Map<string, TopPick> }) {
  const img = spec.image_id ? imageById.get(spec.image_id) : undefined
  const focal = spec.crop ?? { focalX: 0.5, focalY: 0.4 }
  const baseSize = 96
  const headlineSize = baseSize * SCALE_FACTOR[tokens.typography_scale]

  return (
    <>
      {img && (
        <img
          src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
          alt=""
          loading="lazy"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: `${focal.focalX * 100}% ${focal.focalY * 100}%`,
            filter: 'grayscale(1) contrast(1.15)',
          }}
        />
      )}
      {/* Color overlay = duotone effect via mix-blend-mode */}
      <div style={{
        position: 'absolute', inset: 0,
        background: tokens.accent_color,
        mixBlendMode: 'multiply',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: tokens.bg_color,
        mixBlendMode: 'lighten',
        opacity: 0.55,
      }} />
      {tokens.grain ? <Grain /> : null}
      <div style={{
        position: 'absolute', insetInlineStart: 0, bottom: 0,
        padding: '0 76px 88px',
        direction: 'rtl', textAlign: 'right',
        color: tokens.text_color,
      }}>
        <h2 style={{
          fontFamily: tokens.font_display,
          fontSize: headlineSize, fontWeight: 800,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          margin: 0,
        }}>{spec.headline}</h2>
        {spec.caption && (
          <p style={{
            fontFamily: tokens.font_body,
            marginTop: 24, fontSize: 26, lineHeight: 1.5, opacity: 0.85,
          }}>{spec.caption}</p>
        )}
      </div>
    </>
  )
}

// Soft film-grain overlay for moody directions (cinematic, luxury).
function Grain() {
  const grainStyle: CSSProperties = useMemo(() => ({
    position: 'absolute', inset: 0,
    backgroundImage: `radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)`,
    backgroundSize: '3px 3px',
    mixBlendMode: 'overlay',
    pointerEvents: 'none',
    opacity: 0.4,
  }), [])
  return <div style={grainStyle} />
}
