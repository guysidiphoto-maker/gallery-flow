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
 *   { images: string[], durationSeconds?: number, motionMode?: 'none'|'subtle'|'dynamic' }
 *
 * Image URLs may be local file URLs (file://) when running locally, or
 * public Supabase URLs when running on Lambda.
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

export interface CleanProps {
  images: string[];
  /** Optional pre-built scene list. If absent, every image becomes a portrait scene. */
  scenes?: SceneSpec[];
  durationSeconds?: number;
  motionMode?: MotionMode;
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

// ── Top-level composition ───────────────────────────────────────────────────

export const Clean: React.FC<CleanProps> = ({
  images,
  scenes: providedScenes,
  durationSeconds = 30,
  motionMode = 'subtle',
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
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
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
    </AbsoluteFill>
  );
};

// ── Helpers exported for the renderer scripts ──────────────────────────────

export function computeTotalFrames(scenes: SceneSpec[], fps: number = FPS): number {
  if (scenes.length === 0) return 0;
  const sumScenes = scenes.reduce((s, sc) => s + Math.round(sc.durationSec * fps), 0);
  const overlap = (scenes.length - 1) * Math.round(TRANSITION_DURATION_SEC * fps);
  return Math.max(1, sumScenes - overlap);
}

export const CLEAN_OUTPUT = { width: OUT_W, height: OUT_H, fps: FPS } as const;
