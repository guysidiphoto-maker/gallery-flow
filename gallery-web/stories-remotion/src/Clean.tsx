/**
 * Clean.tsx — Remotion port of the desktop "clean" style story.
 *
 * Behavior parity reference: ../../../src/main/storyRenderer.ts
 *   - buildSceneGroups   → buildScenes() below
 *   - assignMotionType   → PORTRAIT_MOTION_SEQ / LANDSCAPE_MOTION_SEQ
 *   - buildMotionFilter  → MotionImage component
 *   - renderPortraitScene / Landscape{1,2,3}Scene → Scene components
 *   - concatenateScenes (xfade=fade) → crossfade via opacity interpolation
 *
 * Output: 1080x1920 @ 30fps. Motion runs at 2x working resolution internally
 * via CSS transform scale + transformOrigin to avoid the same integer-pixel
 * jitter the FFmpeg side mitigated with WORK_W=2160/WORK_H=3840 + scale down.
 *
 * Composition input props:
 *   { images: string[], durationSeconds?: number, motionMode?: 'none'|'subtle'|'dynamic',
 *     brand?: BrandKit }
 *
 * Image URLs may be local file URLs (file://) when running locally, or
 * public Supabase URLs when running on Lambda.
 *
 * Brand integration (opt-in): when `brand` is provided, the composition wraps
 * the photo sequence with an intro card (1.5s), an outro card (2.0s), and a
 * subtle bottom-right watermark across the body. With no brand prop the
 * composition behaves identically to the original photo-only spike.
 */

import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ── Constants (mirror desktop renderer) ─────────────────────────────────────

const OUT_W = 1080;
const OUT_H = 1920;
const FPS = 30;

const TRANSITION_DURATION_SEC = 0.4; // matches FFmpeg xfade duration for 'clean'
const MIN_SCENE_DURATION_SEC = 2.0;
const MAX_SCENE_DURATION_SEC = 8.0;

const PORTRAIT_ZOOM: Record<MotionMode, number> = { none: 1.0, subtle: 1.06, dynamic: 1.1 };
const LANDSCAPE_ZOOM: Record<MotionMode, number> = { none: 1.0, subtle: 1.03, dynamic: 1.05 };

const PORTRAIT_MOTION_SEQ: MotionType[] = [
  'zoom-in',
  'pan-right',
  'zoom-out',
  'pan-left',
  'drift-up',
  'drift-down',
];
const LANDSCAPE_MOTION_SEQ: MotionType[] = ['zoom-in', 'pan-left', 'pan-right', 'zoom-out'];

const PAN_ZOOM = 1.04;
// Desktop uses 60px drift at 2x (=30px at final). At Remotion's 1080x1920
// canvas we keep the same final 30px drift.
const DRIFT_PX_FINAL = 30;

// ── Brand integration constants ─────────────────────────────────────────────
//
// Total runtime extension when a brand is set: INTRO_SEC + OUTRO_SEC = 3.5s.
// The brand→photo crossfade and photo→outro crossfade overlap by
// BRAND_CROSSFADE_SEC and are absorbed into the intro/outro durations, so the
// photo body keeps its original total duration math (see buildScenes).

const INTRO_SEC = 1.5;
const OUTRO_SEC = 2.0;
const BRAND_CROSSFADE_SEC = 0.4; // matches TRANSITION_DURATION_SEC for visual continuity
const DEFAULT_INK = '#0a0a0f';
const DEFAULT_PAPER = '#ffffff';
const WATERMARK_OPACITY = 0.2;
const WATERMARK_SCALE_OF_WIDTH = 0.08; // 8% of frame width

// ── Types ────────────────────────────────────────────────────────────────────

export type MotionMode = 'none' | 'subtle' | 'dynamic';
export type MotionType =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'drift-up'
  | 'drift-down';

export type SceneType = 'portrait' | 'landscape-3' | 'landscape-2' | 'landscape-1';

// We can't probe dimensions inside a pure React composition without an async
// step. For the spike we assume callers either:
//   (a) provide orientation hints via cleanInputProps (Phase 1), OR
//   (b) accept that the composition treats every image as a "portrait" solo
//       scene — the most common output style for clean vertical stories.
// The buildScenes helper below is exported for use by the local render script,
// which DOES probe dimensions on the host.
export interface SceneSpec {
  type: SceneType;
  images: string[]; // absolute URLs or file:// paths
  durationSec: number;
  motionType: MotionType;
}

/**
 * BrandKit — minimal shape consumed by the composition.
 *
 * Mirrors `gallery-web/src/lib/brandKit.ts` from `feat/web-brand-kit-page`.
 * Defined locally here so the spike has no build-time coupling to that
 * branch; once merged, this interface can be replaced with a re-export.
 *
 * Every field is optional so the composition can degrade gracefully:
 *   - no logo + no studio_name → no intro card, no outro card, no watermark
 *   - logo only                → intro/outro show logo; tagline/signature skipped
 *   - studio_name only         → intro/outro show typography only
 *
 * Backwards compat: omit the `brand` prop entirely and the composition behaves
 * exactly as the original photo-only spike.
 */
export interface BrandKit {
  studio_name?: string;
  logo?: {
    url?: string;
  };
  colors?: {
    primary?: string;
    ink?: string;
    paper?: string;
  };
  voice?: {
    tagline?: string;
    signature?: string;
  };
  social?: {
    instagram?: string;
    tiktok?: string;
    website?: string;
  };
}

export interface CleanProps {
  images: string[];
  /** Optional pre-built scene list. If absent, every image becomes a portrait scene. */
  scenes?: SceneSpec[];
  durationSeconds?: number;
  motionMode?: MotionMode;
  /**
   * Optional brand kit. When provided AND it carries at least a logo URL or a
   * studio_name, an intro card (1.5s), an outro card (2.0s), and a subtle
   * bottom-right watermark are layered around the photo sequence.
   */
  brand?: BrandKit;
}

/** True when there is enough brand data to render any branded surface. */
function hasUsableBrand(brand?: BrandKit): brand is BrandKit {
  if (!brand) return false;
  const hasLogo = !!brand.logo?.url;
  const hasName = !!(brand.studio_name && brand.studio_name.trim());
  return hasLogo || hasName;
}

// ── Pure scene builder (mirrors desktop buildSceneGroups) ───────────────────

export interface ImageDims {
  url: string;
  width: number;
  height: number;
}

export function buildScenes(
  imgs: ImageDims[],
  totalDuration: number,
  motionMode: MotionMode = 'subtle',
): SceneSpec[] {
  const groups: Array<{ type: SceneType; images: ImageDims[] }> = [];
  let i = 0;

  while (i < imgs.length) {
    const img = imgs[i];
    if (!img) break;
    if (img.height > img.width) {
      groups.push({ type: 'portrait', images: [img] });
      i++;
    } else {
      const chunk: ImageDims[] = [];
      while (i < imgs.length) {
        const cur = imgs[i];
        if (!cur || cur.width < cur.height) break;
        chunk.push(cur);
        i++;
      }
      for (let j = 0; j < chunk.length; j += 3) {
        const slice = chunk.slice(j, j + 3);
        const type: SceneType =
          slice.length === 3 ? 'landscape-3' : slice.length === 2 ? 'landscape-2' : 'landscape-1';
        groups.push({ type, images: slice });
      }
    }
  }

  const n = groups.length;
  if (n === 0) return [];

  const usable = totalDuration - Math.max(0, n - 1) * TRANSITION_DURATION_SEC;
  const raw = usable / n;
  const clamped = Math.max(MIN_SCENE_DURATION_SEC, Math.min(raw, MAX_SCENE_DURATION_SEC));

  return groups.map((g, idx) => ({
    type: g.type,
    images: g.images.map((x) => x.url),
    durationSec: clamped,
    motionType: assignMotionType(idx, g.type === 'portrait', motionMode),
  }));
}

function assignMotionType(sceneIndex: number, isPortrait: boolean, mode: MotionMode): MotionType {
  if (mode === 'none') return 'zoom-in';
  const seq = isPortrait ? PORTRAIT_MOTION_SEQ : LANDSCAPE_MOTION_SEQ;
  return seq[sceneIndex % seq.length]!;
}

// ── Motion image — single image with a zoompan-equivalent transform ─────────

interface MotionImageProps {
  src: string;
  motion: MotionType;
  motionMode: MotionMode;
  isPortrait: boolean;
  durationFrames: number;
  /** Optional override for the rendered box; defaults to full output size. */
  width?: number;
  height?: number;
}

const MotionImage: React.FC<MotionImageProps> = ({
  src,
  motion,
  motionMode,
  isPortrait,
  durationFrames,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const zoomTable = isPortrait ? PORTRAIT_ZOOM : LANDSCAPE_ZOOM;
  const endZoom = zoomTable[motionMode] ?? zoomTable.subtle;

  // Progress 0..1 across the scene's frames
  const t = durationFrames <= 1 ? 0 : frame / (durationFrames - 1);

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  switch (motion) {
    case 'zoom-in':
      scale = 1 + (endZoom - 1) * t;
      break;
    case 'zoom-out':
      scale = endZoom - (endZoom - 1) * t;
      break;
    case 'pan-right':
      // Mirror FFmpeg pan: zoom slightly so there is room to translate.
      scale = PAN_ZOOM;
      // Move image leftward (camera pans right). Range = available pixels.
      translateX = -((PAN_ZOOM - 1) * (width ?? OUT_W)) * (t - 0.5);
      break;
    case 'pan-left':
      scale = PAN_ZOOM;
      translateX = ((PAN_ZOOM - 1) * (width ?? OUT_W)) * (t - 0.5);
      break;
    case 'drift-up':
      scale = 1 + (endZoom - 1) * t;
      translateY = -DRIFT_PX_FINAL * t;
      break;
    case 'drift-down':
      scale = 1 + (endZoom - 1) * t;
      translateY = DRIFT_PX_FINAL * t;
      break;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: width ?? '100%',
        height: height ?? '100%',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <Img
        src={src}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transformOrigin: '50% 50%',
          // translate first (in CSS px), then scale around the center
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          // Hint browser to use compositor; avoids subpixel jitter under
          // Chromium's headless raster.
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  );
};

// ── Landscape collage helpers (stacked rows like FFmpeg vstack) ─────────────

const Landscape2: React.FC<{
  srcs: string[];
  motion: MotionType;
  motionMode: MotionMode;
  durationFrames: number;
}> = ({ srcs, motion, motionMode, durationFrames }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
    {srcs.slice(0, 2).map((s, idx) => (
      <div key={idx} style={{ flex: 1, position: 'relative' }}>
        <MotionImage
          src={s}
          motion={motion}
          motionMode={motionMode}
          isPortrait={false}
          durationFrames={durationFrames}
          width={OUT_W}
          height={OUT_H / 2}
        />
      </div>
    ))}
  </div>
);

const Landscape3: React.FC<{
  srcs: string[];
  motion: MotionType;
  motionMode: MotionMode;
  durationFrames: number;
}> = ({ srcs, motion, motionMode, durationFrames }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
    {srcs.slice(0, 3).map((s, idx) => (
      <div key={idx} style={{ flex: 1, position: 'relative' }}>
        <MotionImage
          src={s}
          motion={motion}
          motionMode={motionMode}
          isPortrait={false}
          durationFrames={durationFrames}
          width={OUT_W}
          height={OUT_H / 3}
        />
      </div>
    ))}
  </div>
);

/**
 * Landscape1 — one landscape image on a blurred copy of itself.
 * Mirrors the desktop boxblur+colorlevels darken background composite.
 */
const Landscape1: React.FC<{
  src: string;
  motion: MotionType;
  motionMode: MotionMode;
  durationFrames: number;
}> = ({ src, motion, motionMode, durationFrames }) => (
  <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000' }}>
    {/* Blurred, darkened background — matches FFmpeg boxblur+colorlevels */}
    <Img
      src={src}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        filter: 'blur(44px) brightness(0.55)',
        transform: 'scale(1.1)', // overscan so blur edges don't show
      }}
    />
    {/* Foreground centered */}
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        transform: 'translateY(-50%)',
        aspectRatio: 'auto',
      }}
    >
      <MotionImage
        src={src}
        motion={motion}
        motionMode={motionMode}
        isPortrait={false}
        durationFrames={durationFrames}
      />
    </div>
  </div>
);

// ── One scene wrapper ───────────────────────────────────────────────────────

const SceneRenderer: React.FC<{ scene: SceneSpec }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const durationFrames = Math.round(scene.durationSec * fps);

  switch (scene.type) {
    case 'portrait':
      return (
        <MotionImage
          src={scene.images[0]!}
          motion={scene.motionType}
          motionMode="subtle"
          isPortrait
          durationFrames={durationFrames}
        />
      );
    case 'landscape-1':
      return (
        <Landscape1
          src={scene.images[0]!}
          motion={scene.motionType}
          motionMode="subtle"
          durationFrames={durationFrames}
        />
      );
    case 'landscape-2':
      return (
        <Landscape2
          srcs={scene.images}
          motion={scene.motionType}
          motionMode="subtle"
          durationFrames={durationFrames}
        />
      );
    case 'landscape-3':
      return (
        <Landscape3
          srcs={scene.images}
          motion={scene.motionType}
          motionMode="subtle"
          durationFrames={durationFrames}
        />
      );
  }
};

// ── Crossfade wrapper for a scene ──────────────────────────────────────────

const CrossfadeScene: React.FC<{
  scene: SceneSpec;
  isFirst: boolean;
  isLast: boolean;
}> = ({ scene, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.round(scene.durationSec * fps);
  const fadeFrames = Math.round(TRANSITION_DURATION_SEC * fps);

  // Fade in over first `fadeFrames`, fade out over last `fadeFrames`.
  // The Sequence wrappers in <Clean> overlap by `fadeFrames`, so the fades
  // line up to produce the FFmpeg `xfade=fade` crossfade.
  const fadeIn = isFirst
    ? 1
    : interpolate(frame, [0, fadeFrames], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = isLast
    ? 1
    : interpolate(frame, [totalFrames - fadeFrames, totalFrames], [1, 0], {
        extrapolateLeft: 'clamp',
      });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity }}>
      <SceneRenderer scene={scene} />
    </AbsoluteFill>
  );
};

// ── Brand surfaces: intro card, outro card, watermark ──────────────────────

/**
 * IntroCard — branded opener shown before the first photo.
 *
 * Timing (frames are computed against `useVideoConfig().fps`):
 *   - 0.0s: solid brand background appears
 *   - 0.4s: logo fades in (200ms)
 *   - 0.8s: studio name + tagline fade in (200ms)
 *   - 1.4s → 1.5s: card fades out (crossfades into first photo)
 *
 * If the brand has no logo, the logo block is skipped (typography only).
 * If the brand has no studio_name, the typography block is skipped.
 */
const IntroCard: React.FC<{ brand: BrandKit; durationFrames: number }> = ({
  brand,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bg = brand.colors?.ink || DEFAULT_INK;
  const fg = brand.colors?.paper || DEFAULT_PAPER;
  const accent = brand.colors?.primary || fg;
  const logoUrl = brand.logo?.url;
  const name = brand.studio_name?.trim();
  const tagline = brand.voice?.tagline?.trim();

  const fadeInFrames = Math.round(0.2 * fps);
  const logoStart = Math.round(0.4 * fps);
  const typoStart = Math.round(0.8 * fps);
  const fadeOutStart = durationFrames - Math.round(BRAND_CROSSFADE_SEC * fps);

  const logoOpacity = interpolate(
    frame,
    [logoStart, logoStart + fadeInFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const typoOpacity = interpolate(
    frame,
    [typoStart, typoStart + fadeInFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const cardOpacity = interpolate(
    frame,
    [fadeOutStart, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        opacity: cardOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Heebo, system-ui, -apple-system, "Segoe UI", sans-serif',
        textAlign: 'center',
        padding: 80,
      }}
    >
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            maxWidth: '40%',
            maxHeight: '32%',
            objectFit: 'contain',
            opacity: logoOpacity,
            marginBottom: 48,
          }}
        />
      ) : null}
      {name ? (
        <div style={{ opacity: typoOpacity }}>
          <div
            style={{
              color: fg,
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -1,
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          {tagline ? (
            <div
              style={{
                color: accent,
                fontSize: 28,
                fontWeight: 400,
                marginTop: 16,
                lineHeight: 1.3,
                opacity: 0.85,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * OutroCard — branded closer shown after the last photo.
 *
 * Timing:
 *   - 0.0s → 0.4s: card fades in (crossfades from last photo)
 *   - 0.5s: logo + thank-you/tagline visible at full opacity
 *   - 2.0s: hard cut to end of composition
 *
 * Content priority:
 *   - If `voice.signature` is set, use it as the headline.
 *   - Else if `studio_name` is set, headline is "תודה · {studio_name}".
 *   - Else if `voice.tagline` is set, use it.
 *   - Else logo-only.
 *
 * Social handles are listed below at smaller size when present.
 */
const OutroCard: React.FC<{ brand: BrandKit; durationFrames: number }> = ({
  brand,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bg = brand.colors?.ink || DEFAULT_INK;
  const fg = brand.colors?.paper || DEFAULT_PAPER;
  const accent = brand.colors?.primary || fg;
  const logoUrl = brand.logo?.url;
  const name = brand.studio_name?.trim();
  const tagline = brand.voice?.tagline?.trim();
  const signature = brand.voice?.signature?.trim();

  const headline = signature
    ? signature
    : name
      ? `תודה · ${name}`
      : tagline || null;

  const fadeInFrames = Math.round(BRAND_CROSSFADE_SEC * fps);
  const cardOpacity = interpolate(frame, [0, fadeInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const socialEntries = brand.social
    ? [
        brand.social.instagram ? `@${brand.social.instagram.replace(/^@/, '')}` : null,
        brand.social.tiktok ? `@${brand.social.tiktok.replace(/^@/, '')} (TikTok)` : null,
        brand.social.website ? brand.social.website.replace(/^https?:\/\//, '') : null,
      ].filter((x): x is string => !!x)
    : [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        opacity: cardOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Heebo, system-ui, -apple-system, "Segoe UI", sans-serif',
        textAlign: 'center',
        padding: 80,
      }}
    >
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            maxWidth: '28%',
            maxHeight: '22%',
            objectFit: 'contain',
            marginBottom: 40,
          }}
        />
      ) : null}
      {headline ? (
        <div
          style={{
            color: fg,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: -0.5,
            lineHeight: 1.2,
          }}
        >
          {headline}
        </div>
      ) : null}
      {socialEntries.length > 0 ? (
        <div
          style={{
            color: accent,
            fontSize: 22,
            fontWeight: 400,
            marginTop: 32,
            opacity: 0.8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {socialEntries.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Watermark — bottom-right brand mark layered over the photo sequence.
 *
 * - Renders logo at 8% of frame width, 20% opacity.
 * - If brand has no logo but has studio_name, renders text mark instead.
 * - If brand has neither, this component is skipped at the call site.
 */
const Watermark: React.FC<{ brand: BrandKit }> = ({ brand }) => {
  const logoUrl = brand.logo?.url;
  const name = brand.studio_name?.trim();
  const fg = brand.colors?.paper || DEFAULT_PAPER;
  const widthPx = Math.round(OUT_W * WATERMARK_SCALE_OF_WIDTH);

  if (!logoUrl && !name) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: WATERMARK_OPACITY,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 28,
      }}
    >
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            width: widthPx,
            height: 'auto',
            maxHeight: widthPx,
            objectFit: 'contain',
            // soft drop-shadow keeps the mark readable on bright photos
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
          }}
        />
      ) : (
        <div
          style={{
            color: fg,
            fontFamily: 'Heebo, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: 18,
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,0.45)',
          }}
        >
          {name}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Top-level composition ───────────────────────────────────────────────────

export const Clean: React.FC<CleanProps> = ({
  images,
  scenes: providedScenes,
  durationSeconds = 30,
  motionMode = 'subtle',
  brand,
}) => {
  const { fps } = useVideoConfig();

  // If caller didn't pre-compute scenes (no dimension hints), fall back to
  // "every image is a portrait scene" — the most common path for vertical
  // stories. The local render script *does* probe dimensions and passes
  // proper `scenes` in production.
  const scenes: SceneSpec[] =
    providedScenes && providedScenes.length > 0
      ? providedScenes
      : buildScenes(
          images.map((url) => ({ url, width: 1080, height: 1920 })),
          durationSeconds,
          motionMode,
        );

  const fadeFrames = Math.round(TRANSITION_DURATION_SEC * fps);
  const brandOn = hasUsableBrand(brand);
  const introFrames = brandOn ? Math.round(INTRO_SEC * fps) : 0;
  const outroFrames = brandOn ? Math.round(OUTRO_SEC * fps) : 0;
  const brandFadeFrames = brandOn ? Math.round(BRAND_CROSSFADE_SEC * fps) : 0;

  // Photo body begins after the intro card, overlapping by BRAND_CROSSFADE_SEC
  // so the intro's fade-out crossfades into the first photo's fade-in.
  const photoBodyStart = brandOn ? introFrames - brandFadeFrames : 0;
  let cursor = photoBodyStart;

  // Compute the absolute frame at which the photo body ends so the outro can
  // start one crossfade earlier and absorb the overlap.
  const photoBodyFrames = computePhotoBodyFrames(scenes, fps);
  const photoBodyEnd = photoBodyStart + photoBodyFrames;
  const outroStart = brandOn ? photoBodyEnd - brandFadeFrames : photoBodyEnd;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {brandOn ? (
        <Sequence from={0} durationInFrames={introFrames} layout="none">
          <IntroCard brand={brand!} durationFrames={introFrames} />
        </Sequence>
      ) : null}

      {scenes.map((scene, idx) => {
        const sceneFrames = Math.round(scene.durationSec * fps);
        const from = cursor;
        cursor += sceneFrames - fadeFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={sceneFrames} layout="none">
            <CrossfadeScene
              scene={scene}
              isFirst={idx === 0}
              isLast={idx === scenes.length - 1}
            />
          </Sequence>
        );
      })}

      {brandOn ? (
        <Sequence
          from={photoBodyStart}
          durationInFrames={Math.max(1, photoBodyFrames)}
          layout="none"
        >
          <Watermark brand={brand!} />
        </Sequence>
      ) : null}

      {brandOn ? (
        <Sequence from={outroStart} durationInFrames={outroFrames} layout="none">
          <OutroCard brand={brand!} durationFrames={outroFrames} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

// ── Helpers exported for the renderer scripts ──────────────────────────────

/**
 * Photo-body length only — no intro/outro. Equal to the FFmpeg
 * `xfade offset=cumDuration - td` chain: `sum(scene) - (n-1)*0.4`.
 */
export function computePhotoBodyFrames(scenes: SceneSpec[], fps: number = FPS): number {
  if (scenes.length === 0) return 0;
  const sumScenes = scenes.reduce((s, sc) => s + Math.round(sc.durationSec * fps), 0);
  const overlap = (scenes.length - 1) * Math.round(TRANSITION_DURATION_SEC * fps);
  return Math.max(1, sumScenes - overlap);
}

/**
 * Total composition length including the brand intro + outro when a brand kit
 * is supplied (and has at least a logo or studio name). Intro/outro each
 * overlap with the body by BRAND_CROSSFADE_SEC; the net runtime extension is
 * therefore `INTRO_SEC + OUTRO_SEC - 2*BRAND_CROSSFADE_SEC`.
 *
 * Callers without a brand pass `brand: undefined` and the function reduces to
 * the original photo-only frame count — keeps timeline math backwards
 * compatible.
 */
export function computeTotalFrames(
  scenes: SceneSpec[],
  fps: number = FPS,
  brand?: BrandKit,
): number {
  const body = computePhotoBodyFrames(scenes, fps);
  if (!hasUsableBrand(brand)) return body;
  const intro = Math.round(INTRO_SEC * fps);
  const outro = Math.round(OUTRO_SEC * fps);
  const overlap = 2 * Math.round(BRAND_CROSSFADE_SEC * fps);
  return Math.max(1, body + intro + outro - overlap);
}

export const CLEAN_OUTPUT = { width: OUT_W, height: OUT_H, fps: FPS } as const;
export const BRAND_TIMING = {
  introSec: INTRO_SEC,
  outroSec: OUTRO_SEC,
  crossfadeSec: BRAND_CROSSFADE_SEC,
  /** Net runtime extension when brand is on. */
  extensionSec: INTRO_SEC + OUTRO_SEC - 2 * BRAND_CROSSFADE_SEC,
} as const;
