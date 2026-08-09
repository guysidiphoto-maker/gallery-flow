// sceneplan.ts — Pixflow Story Studio canonical scene-plan contract (v1).
//
// This file is the SINGLE SOURCE OF TRUTH for the shape of a story. The editor,
// the live preview, the final render (Remotion), persistence (story_renders.scene_plan
// JSONB) and the test-suite all import these types + validators. If preview and export
// ever diverge it is a bug in a consumer, never a second model here.
//
// Design rules:
//   1. Deterministic: a ScenePlan fully describes a video. Same plan -> same MP4.
//   2. Erasable TypeScript only (no enums / no namespaces) so it runs under Node's
//      native type-stripping for zero-dependency unit tests.
//   3. No imports. This module must be loadable from the web app, the Vercel API
//      function, the Remotion bundle and a bare `node --test` worktree alike.

export const SCENE_PLAN_VERSION = 1 as const;

// ── Output geometry ─────────────────────────────────────────────────────────
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const STORY_FPS = 30;

// Per-scene duration clamps (seconds). Below MIN a photo cannot register; above
// MAX a single photo drags the pace. MIN is deliberately low (1.2s) so the
// fast-highlights template can cut on the beat like a real reel, while the
// calmer templates sit far above the floor — the pace gap between templates is
// itself a differentiator.
export const MIN_SCENE_SEC = 1.2;
export const MAX_SCENE_SEC = 6.0;
export const MIN_TRANSITION_SEC = 0.2;
export const MAX_TRANSITION_SEC = 1.2;

// Caps that bound render cost + protect against abuse (mirrored by the validator
// and the render endpoint allowlist).
export const MIN_SCENES = 3;
export const MAX_SCENES = 40;
export const MAX_TEXT_LEN = 120;
export const MAX_TITLE_LEN = 80;

// FIRST-RELEASE synchronous-render cap (separate from the structural MAX_SCENES).
// One Vercel function is capped at 300s; measured render cost is ~10-12s/scene,
// so we hard-limit a synchronous render to keep it well under the ceiling and
// avoid orphaned jobs. Longer stories require the queue/Lambda path (documented
// in docs/story-studio). Mirrored by api/stories/_scenePlanGuard.ts.
export const RENDER_MAX_SCENES = 18;
export const RENDER_MAX_DURATION_SEC = 45;

// ── Enumerated vocabularies (string-literal unions, not TS enums) ─────────────
export type StoryFormat = "9:16"; // primary + only supported export today
export type StoryTemplate = "editorial-clean" | "cinematic-energy" | "fast-highlights";
export type StoryLength = "short" | "standard" | "extended";
export type GlobalPace = "relaxed" | "balanced" | "energetic";

// "punch-in" is a fast snap-and-settle zoom (starts slightly enlarged, eases to
// rest in the first third of the scene) — reads as energetic; used by
// fast-highlights. The gentler push-in/pull-out are continuous Ken Burns moves.
export type MotionEffect = "none" | "push-in" | "pull-out" | "pan" | "focus-zoom" | "punch-in";
export type MotionDirection = "left" | "right" | "up" | "down";
export type MotionIntensity = "subtle" | "medium" | "strong";

// "whip" is a fast motion-blur horizontal slide (reel-style hard-ish cut); the
// other transitions are slower/softer. Templates pick disjoint vocabularies.
export type TransitionType = "cut" | "cross-dissolve" | "slide" | "soft-blur" | "light-leak" | "whip";
export type FitMode = "fill" | "fit";
export type BackgroundTreatment = "blur" | "color" | "none";
export type TextPosition = "top" | "center" | "bottom";
export type Orientation = "portrait" | "landscape" | "square";

export const TEMPLATES: readonly StoryTemplate[] = [
  "editorial-clean",
  "cinematic-energy",
  "fast-highlights",
];
export const MOTION_EFFECTS: readonly MotionEffect[] = [
  "none",
  "push-in",
  "pull-out",
  "pan",
  "focus-zoom",
  "punch-in",
];
export const TRANSITIONS: readonly TransitionType[] = [
  "cut",
  "cross-dissolve",
  "slide",
  "soft-blur",
  "light-leak",
  "whip",
];

// ── Core structures ───────────────────────────────────────────────────────────

/** Normalized 0..1 focal point used as the crop/motion anchor (subject-aware). */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface SceneText {
  content: string;
  position: TextPosition;
  /** Seconds after scene start the text appears. Omitted => whole scene. */
  startSec?: number;
  durationSec?: number;
}

export interface Scene {
  /** Stable id for React keys, drag-reorder and undo/redo. */
  id: string;
  /** FK -> images.id. MUST belong to the same gallery (validated before render). */
  imageId: string;
  /** Resolved image URL. Filled at render time only; never a long-lived signed URL. */
  src?: string;
  /** Intrinsic pixels, used for fit + focal math. Optional (degrade to fill/center). */
  width?: number;
  height?: number;
  durationSec: number;
  fit: FitMode;
  background: BackgroundTreatment;
  focal: FocalPoint;
  motion: MotionEffect;
  motionDirection: MotionDirection;
  motionIntensity: MotionIntensity;
  transitionIn: TransitionType;
  transitionDurationSec: number;
  text?: SceneText | null;
  /** Dev-only diagnostic explaining an automatic choice. Stripped before render. */
  _reason?: string;
}

export interface TitleCard {
  kind: "opening" | "outro";
  enabled: boolean;
  title?: string;
  subtitle?: string;
  showLogo: boolean;
  durationSec: number;
}

/**
 * The resolved branding SNAPSHOT. Captured once (from the Brand Kit + gallery
 * override) and stored on the plan so preview and export render byte-identical
 * branding even if the global Brand Kit changes later.
 */
export interface BrandResolved {
  logoUrl?: string | null;
  accentHex: string;
  headingFont: string;
  bodyFont: string;
  studioName?: string | null;
  watermark?: {
    enabled: boolean;
    opacityPercent: number;
    position: string;
  } | null;
}

export interface MusicConfig {
  trackId?: string | null;
  volume: number; // 0..1
  fadeInSec: number;
  fadeOutSec: number;
  muted: boolean;
}

export interface ScenePlan {
  version: number;
  galleryId: string;
  format: StoryFormat;
  template: StoryTemplate;
  length: StoryLength;
  pace: GlobalPace;
  fps: number;
  width: number;
  height: number;
  opening: TitleCard;
  outro: TitleCard;
  scenes: Scene[];
  brand: BrandResolved;
  music?: MusicConfig | null;
  generatedBy: "auto" | "manual";
  /** Deterministic seed so an auto-plan is reproducible. */
  planSeed?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

export function orientationOf(width?: number, height?: number): Orientation {
  if (!width || !height || width <= 0 || height <= 0) return "portrait";
  const r = width / height;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

/**
 * Total video length in seconds = opening card (if enabled) + every scene +
 * outro card (if enabled). Transitions overlap the outgoing scene so they do
 * NOT add wall-clock time (matching the Remotion sequence layout).
 */
export function computeTotalDuration(plan: ScenePlan): number {
  let total = 0;
  if (plan.opening?.enabled) total += plan.opening.durationSec;
  for (const s of plan.scenes) total += s.durationSec;
  if (plan.outro?.enabled) total += plan.outro.durationSec;
  return Math.round(total * 100) / 100;
}

/**
 * Total frame count of the rendered video. Transitions overlap the previous
 * scene (net-zero wall-clock), so this = opening + Σ scenes + outro, each in
 * frames. Shared by the render (Root.calculateMetadata) and the editor's
 * <Player> so preview length can never drift from export length.
 */
export function totalFrames(plan: ScenePlan): number {
  const f = (s: number) => Math.max(1, Math.round(s * plan.fps));
  let total = 0;
  if (plan.opening?.enabled) total += f(plan.opening.durationSec);
  for (const s of plan.scenes) total += f(s.durationSec);
  if (plan.outro?.enabled) total += f(plan.outro.durationSec);
  return Math.max(1, total);
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Structural + SECURITY validation. `allowedImageIds`, when provided, is the set
 * of image ids that belong to the gallery — every scene must reference one of
 * them. This is the tenant-isolation gate the render endpoint runs before it
 * touches storage: a plan can never smuggle in a foreign image id.
 */
export function validateScenePlan(
  plan: ScenePlan,
  allowedImageIds?: ReadonlySet<string> | readonly string[]
): ValidationResult {
  const errors: string[] = [];
  const allow =
    allowedImageIds instanceof Set
      ? allowedImageIds
      : allowedImageIds
        ? new Set(allowedImageIds)
        : null;

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["plan is not an object"] };
  }
  if (plan.version !== SCENE_PLAN_VERSION) {
    errors.push(`unsupported version ${plan.version} (expected ${SCENE_PLAN_VERSION})`);
  }
  if (!plan.galleryId) errors.push("missing galleryId");
  if (plan.format !== "9:16") errors.push(`unsupported format ${plan.format}`);
  if (!TEMPLATES.includes(plan.template)) errors.push(`unknown template ${plan.template}`);
  if (plan.width !== STORY_WIDTH || plan.height !== STORY_HEIGHT) {
    errors.push("width/height must be 1080x1920");
  }
  if (plan.fps !== STORY_FPS) errors.push(`fps must be ${STORY_FPS}`);

  if (!Array.isArray(plan.scenes) || plan.scenes.length < MIN_SCENES) {
    errors.push(`need at least ${MIN_SCENES} scenes`);
  }
  if (Array.isArray(plan.scenes) && plan.scenes.length > MAX_SCENES) {
    errors.push(`too many scenes (${plan.scenes.length} > ${MAX_SCENES})`);
  }

  const seenIds = new Set<string>();
  for (const [i, s] of (plan.scenes ?? []).entries()) {
    if (!s.id) errors.push(`scene[${i}] missing id`);
    else if (seenIds.has(s.id)) errors.push(`scene[${i}] duplicate id ${s.id}`);
    else seenIds.add(s.id);

    if (!s.imageId) errors.push(`scene[${i}] missing imageId`);
    else if (allow && !allow.has(s.imageId)) {
      errors.push(`scene[${i}] references foreign imageId ${s.imageId}`);
    }

    if (s.durationSec < MIN_SCENE_SEC - 1e-6 || s.durationSec > MAX_SCENE_SEC + 1e-6) {
      errors.push(`scene[${i}] duration ${s.durationSec} out of [${MIN_SCENE_SEC},${MAX_SCENE_SEC}]`);
    }
    if (
      s.transitionDurationSec < 0 ||
      s.transitionDurationSec > MAX_TRANSITION_SEC + 1e-6
    ) {
      errors.push(`scene[${i}] transition duration out of range`);
    }
    if (!MOTION_EFFECTS.includes(s.motion)) errors.push(`scene[${i}] bad motion ${s.motion}`);
    if (!TRANSITIONS.includes(s.transitionIn)) {
      errors.push(`scene[${i}] bad transition ${s.transitionIn}`);
    }
    if (!s.focal || s.focal.x < 0 || s.focal.x > 1 || s.focal.y < 0 || s.focal.y > 1) {
      errors.push(`scene[${i}] focal point out of 0..1`);
    }
    if (s.text) {
      if (typeof s.text.content !== "string") errors.push(`scene[${i}] text.content not string`);
      else if (s.text.content.length > MAX_TEXT_LEN) errors.push(`scene[${i}] text too long`);
      if (/[<>]/.test(s.text.content || "")) {
        // Text is rendered as plain text; angle brackets are a red flag for
        // markup-injection attempts. Reject rather than sanitize silently.
        errors.push(`scene[${i}] text contains disallowed characters`);
      }
    }
  }

  for (const card of [plan.opening, plan.outro]) {
    if (!card) continue;
    if (card.title && card.title.length > MAX_TITLE_LEN) errors.push(`${card.kind} title too long`);
    if (card.title && /[<>]/.test(card.title)) errors.push(`${card.kind} title disallowed chars`);
    if (card.subtitle && /[<>]/.test(card.subtitle)) errors.push(`${card.kind} subtitle disallowed chars`);
  }

  if (!plan.brand || typeof plan.brand.accentHex !== "string") {
    errors.push("missing resolved brand snapshot");
  } else if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(plan.brand.accentHex)) {
    errors.push(`brand.accentHex not a hex color: ${plan.brand.accentHex}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Render-feasibility gate, separate from structural validity (validateScenePlan).
 * A plan can be a valid ScenePlan yet be too long to render synchronously within
 * the Vercel function ceiling. The editor uses this to explain the limit and
 * disable the render button; the render endpoint enforces the identical rule.
 */
export function checkRenderFeasibility(plan: ScenePlan): { ok: boolean; reason?: string } {
  const n = plan?.scenes?.length ?? 0;
  if (n > RENDER_MAX_SCENES) {
    return {
      ok: false,
      reason: `Story has ${n} scenes; the current limit is ${RENDER_MAX_SCENES}. Remove a few photos and try again.`,
    };
  }
  const dur = computeTotalDuration(plan);
  if (dur > RENDER_MAX_DURATION_SEC + 1e-6) {
    return {
      ok: false,
      reason: `Story is ${dur.toFixed(1)}s; the current limit is ${RENDER_MAX_DURATION_SEC}s. Shorten scenes or remove photos.`,
    };
  }
  return { ok: true };
}

/**
 * Strip dev-only + volatile fields before a plan is handed to the renderer or
 * persisted. Keeps the stored/rendered plan clean and deterministic.
 */
export function sanitizeForRender(plan: ScenePlan): ScenePlan {
  return {
    ...plan,
    scenes: plan.scenes.map((s) => {
      const { _reason, ...rest } = s;
      return rest;
    }),
  };
}
