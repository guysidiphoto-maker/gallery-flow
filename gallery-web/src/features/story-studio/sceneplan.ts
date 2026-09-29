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

// v2 adds: transitionOut, captionStyle, role, locked, beatAlignedSec per scene;
// audio analysis + beatSyncStrength on the plan; parallax/reveal motions and
// fade-color/masked-reveal/match-cut transitions. All new fields are OPTIONAL so
// a v1 plan upgrades losslessly (see upgradeScenePlan).
export const SCENE_PLAN_VERSION = 2 as const;

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
export type MotionEffect =
  | "none" // still hold (important portraits)
  | "push-in"
  | "pull-out"
  | "pan" // face-aware pan (direction chosen toward the subject)
  | "focus-zoom"
  | "punch-in"
  | "parallax" // controlled two-plane drift (foreground vs blurred bed)
  | "reveal"; // directional reveal (image slides in behind a soft wipe)
export type MotionDirection = "left" | "right" | "up" | "down";
export type MotionIntensity = "subtle" | "medium" | "strong";
/** Per-scene caption/title typography style. */
export type CaptionStyle = "editorial" | "bold" | "minimal";
/** The scene's narrative role in the event arc (drives motion/transition/pace). */
export type SceneRole = "hook" | "atmosphere" | "people" | "energy" | "peak" | "closer" | "body";

// "whip" is a fast motion-blur horizontal slide (reel-style hard-ish cut); the
// other transitions are slower/softer. Templates pick disjoint vocabularies.
export type TransitionType =
  | "cut" // hard cut
  | "cross-dissolve" // dissolve
  | "slide" // directional slide
  | "soft-blur"
  | "light-leak"
  | "whip" // controlled whip
  | "fade-color" // fade through a brand/black colour
  | "masked-reveal" // wipe reveal behind a moving soft mask
  | "match-cut"; // match-style cut between compositionally similar shots
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
  "parallax",
  "reveal",
];
export const TRANSITIONS: readonly TransitionType[] = [
  "cut",
  "cross-dissolve",
  "slide",
  "soft-blur",
  "light-leak",
  "whip",
  "fade-color",
  "masked-reveal",
  "match-cut",
];
export const CAPTION_STYLES: readonly CaptionStyle[] = ["editorial", "bold", "minimal"];

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
  /** Transition OUT of this scene. Optional; when omitted the next scene's
   *  transitionIn governs the boundary (they describe the same overlap). */
  transitionOut?: TransitionType;
  transitionOutDurationSec?: number;
  text?: SceneText | null;
  /** Per-scene caption/title typography style. Defaults to the template style. */
  captionStyle?: CaptionStyle;
  /** Narrative role in the event arc (auto-assigned; drives motion/pace). */
  role?: SceneRole;
  /** When true, automatic re-editing must preserve this scene's edits + position. */
  locked?: boolean;
  /** Audio timing: the beat time (s from music start) this scene's cut aligns to. */
  beatAlignedSec?: number;
  /** Scene layout. "single" (default) = one photo. "collage" = 2-3 LANDSCAPE
   *  photos stacked vertically to fill 9:16 with no crop and no black bars —
   *  the right treatment for landscape shots in a vertical story. */
  layout?: "single" | "collage";
  /** For a collage: the 2-3 image ids (incl. imageId) stacked top-to-bottom.
   *  Each cell also needs a resolved src at render time (collageSrc). */
  collageImageIds?: string[];
  /** Resolved image URLs for a collage's cells (filled at render time). */
  collageSrc?: string[];
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
  /** One of MUSIC_TRACK_IDS, or null/undefined for no music. */
  trackId?: string | null;
  volume: number; // 0..1
  fadeInSec: number;
  fadeOutSec: number;
  muted: boolean;
  /** License provenance kept WITH the export (never use unlicensed audio). */
  license?: string | null;
}

/**
 * Genuine audio analysis of the chosen track (from scripts/analyze-audio.py).
 * Times are seconds from the music start. Absent => no beat-sync available.
 */
export interface AudioAnalysis {
  trackId: string;
  durationSec: number;
  bpm?: number | null;
  beatsSec: number[];
  /** Phrase / section boundaries (stronger structural cuts). */
  phrasesSec: number[];
  /** Onset-strength envelope samples (0..1) at ~10Hz, for energy cues. */
  energy?: number[] | null;
}

// ── Music V1: a small curated set of BUNDLED test tracks ──────────────────────
// Authored in-repo (scripts/generate-story-audio.mjs) and shipped as static
// assets in the Remotion bundle, so there is NO third-party licensing dependency
// and NO external fetch/SSRF surface — a plan can only reference an allow-listed
// id, never an arbitrary URL. The composition resolves the id via
// staticFile(`stories-audio/${id}.wav`).
export interface MusicTrack {
  id: string;
  label: string;
  labelHe: string;
  mood: string;
}
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  { id: "calm", label: "Calm", labelHe: "רגוע", mood: "editorial" },
  { id: "warm", label: "Warm", labelHe: "חמים", mood: "cinematic" },
  { id: "upbeat", label: "Upbeat", labelHe: "קצבי", mood: "social" },
];
export const MUSIC_TRACK_IDS: readonly string[] = MUSIC_TRACKS.map((t) => t.id);
export const MUSIC_MAX_FADE_SEC = 8;

/** A track's static asset path inside the bundle (and the Vite public dir). */
export function musicTrackFile(trackId: string): string {
  return `stories-audio/${trackId}.wav`;
}

/** True when a plan actually carries audible music. */
export function planHasMusic(plan: ScenePlan): boolean {
  const m = plan.music;
  return Boolean(m && !m.muted && m.trackId && MUSIC_TRACK_IDS.includes(m.trackId) && (m.volume ?? 0) > 0);
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
  /** Analysis of the chosen track; enables beat-aligned auto cuts. */
  audio?: AudioAnalysis | null;
  /** 0 = ignore beats, 1 = snap every cut to the nearest beat. */
  beatSyncStrength?: number;
  generatedBy: "auto" | "manual";
  /** Deterministic seed so an auto-plan is reproducible. */
  planSeed?: number;
}

/**
 * Upgrade an older plan to the current version losslessly. v1 -> v2 only sets
 * the new version tag (every v2 field is optional and defaults are applied at
 * render time), so a saved v1 draft keeps working.
 */
export function upgradeScenePlan<T extends { version: number }>(plan: T): T {
  if (!plan || typeof plan !== "object") return plan;
  if (plan.version === SCENE_PLAN_VERSION) return plan;
  return { ...plan, version: SCENE_PLAN_VERSION };
}

/**
 * Align scene cuts to the music: nudge each scene's END boundary toward the
 * nearest analysed beat by `beatSyncStrength` (0 = off, 1 = snap fully), keeping
 * every duration within [MIN,MAX]. LOCKED scenes keep their exact duration (the
 * photographer's override wins). Deterministic; preview and export share it.
 * Records the aligned cut time on each scene as `beatAlignedSec`.
 */
export function applyBeatSync(plan: ScenePlan): ScenePlan {
  const audio = plan.audio;
  const strength = plan.beatSyncStrength ?? 0;
  if (!audio || !audio.beatsSec || audio.beatsSec.length < 2 || strength <= 0) return plan;
  const beats = audio.beatsSec;
  const nearestBeat = (t: number): number => {
    let nb = beats[0];
    for (const b of beats) if (Math.abs(b - t) < Math.abs(nb - t)) nb = b;
    return nb;
  };
  let cursor = plan.opening?.enabled ? plan.opening.durationSec : 0;
  const scenes = plan.scenes.map((s) => {
    if (s.locked) {
      cursor += s.durationSec;
      return s;
    }
    const rawEnd = cursor + s.durationSec;
    const nb = nearestBeat(rawEnd);
    const snappedEnd = rawEnd + (nb - rawEnd) * clamp(strength, 0, 1);
    const dur = clamp(Math.round((snappedEnd - cursor) * 100) / 100, MIN_SCENE_SEC, MAX_SCENE_SEC);
    cursor += dur;
    return { ...s, durationSec: dur, beatAlignedSec: Math.round(cursor * 1000) / 1000 };
  });
  return { ...plan, scenes };
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

    // Collage cells are FKs too — tenant-isolate them exactly like imageId so a
    // collage can never smuggle in another gallery's photo.
    if (s.layout === "collage") {
      const ids = s.collageImageIds;
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) {
        errors.push(`scene[${i}] collage must reference 2-3 image ids`);
      } else {
        for (const cid of ids) {
          if (typeof cid !== "string" || !cid) errors.push(`scene[${i}] collage has an invalid image id`);
          else if (allow && !allow.has(cid)) errors.push(`scene[${i}] collage references foreign imageId ${cid}`);
        }
      }
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

  // Music (optional). trackId must be an allow-listed BUNDLED track — never an
  // arbitrary URL — and volume/fades must be in range.
  const m = plan.music;
  if (m) {
    if (m.trackId != null && !MUSIC_TRACK_IDS.includes(m.trackId)) {
      errors.push(`music.trackId not allow-listed: ${m.trackId}`);
    }
    if (typeof m.volume !== "number" || m.volume < 0 || m.volume > 1) {
      errors.push("music.volume out of [0,1]");
    }
    for (const [k, v] of [["fadeInSec", m.fadeInSec], ["fadeOutSec", m.fadeOutSec]] as const) {
      if (typeof v !== "number" || v < 0 || v > MUSIC_MAX_FADE_SEC + 1e-6) {
        errors.push(`music.${k} out of [0,${MUSIC_MAX_FADE_SEC}]`);
      }
    }
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
