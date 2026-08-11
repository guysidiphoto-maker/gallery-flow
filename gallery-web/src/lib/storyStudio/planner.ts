// planner.ts — Pixflow Story Studio deterministic auto-editing engine.
//
// Turns a gallery's photos into a ScenePlan that feels EDITED, not shuffled:
// strong opening, varied composition/motion, burst de-duplication, coherent
// pacing, subject-aware crop, branded outro. Fully deterministic — given the
// same images + options it returns byte-identical output (no Math.random; a
// tiny seeded PRNG drives the few "pick one of N" choices).
//
// It uses OPTIONAL quality metadata (image_ai_scores.story_score / focal point,
// face boxes) ONLY when present and in-range. When absent it falls back to
// honest structural heuristics (top-pick flag, sort order, orientation, capture
// time). It never invents scores.
//
// Zero imports except the contract, so it runs under `node --test` type-stripping.

import {
  type BrandResolved,
  type FocalPoint,
  type GlobalPace,
  type MotionDirection,
  type MotionEffect,
  type MotionIntensity,
  type Orientation,
  type Scene,
  type SceneRole,
  type ScenePlan,
  type StoryLength,
  type StoryTemplate,
  type TransitionType,
  type TitleCard,
  MAX_SCENE_SEC,
  MIN_SCENE_SEC,
  MAX_SCENES,
  MIN_SCENES,
  RENDER_MAX_SCENES,
  RENDER_MAX_DURATION_SEC,
  SCENE_PLAN_VERSION,
  STORY_FPS,
  STORY_HEIGHT,
  STORY_WIDTH,
  clamp,
  orientationOf,
} from "./sceneplan.ts";

export interface PlannerImage {
  id: string;
  /** Resolved preview URL (thumb/web). Ignored by planning; used by the editor
   *  to fill scene.src for the live <Player> preview + storyboard thumbnails. */
  src?: string;
  width?: number;
  height?: number;
  sortOrder: number;
  isTopPick?: boolean;
  /** ISO timestamp if EXIF capture time is known. Used only for burst grouping. */
  capturedAt?: string | null;
  /** image_ai_scores.story_score, 0..10. Optional. */
  storyScore?: number | null;
  /** image_ai_scores.hero_score, 0..10. Optional. */
  heroScore?: number | null;
  /** image_ai_scores.suggested_crop_focal_x/y, 0..1. Optional. */
  focalX?: number | null;
  focalY?: number | null;
  /** Normalized Rekognition face boxes {x,y,w,h} in 0..1. Optional. */
  faceBoxes?: Array<{ x: number; y: number; w: number; h: number }> | null;
  sectionId?: string | null;
  // ── Real content signals (from the image pipeline / detector). All optional;
  //    when present they drive the auto arc, motion and transition choices. ──
  /** Detected face count (0 => room/empty; 1 large => portrait; many => group). */
  faceCount?: number | null;
  /** Largest face area as a share of frame (portraits are high, crowds low). */
  maxFaceArea?: number | null;
  /** Focus/detail, ~0..1 (variance of Laplacian). Low => soft/intentional or blur. */
  sharpness?: number | null;
  /** Mean luma 0..1 (a dark, moody frame reads as an intimate beat). */
  brightness?: number | null;
  /** mean(R)-mean(B) normalized; >0 warm/golden (a good emotional closer). */
  warmth?: number | null;
}

export interface PlannerEvent {
  title?: string | null;
  date?: string | null;
  location?: string | null;
}

export interface PlannerOptions {
  galleryId: string;
  template?: StoryTemplate;
  length?: StoryLength;
  pace?: GlobalPace;
  brand: BrandResolved;
  event?: PlannerEvent;
  seed?: number;
  /**
   * Keep the photographer's EXACT supplied order (the locked source of truth):
   * no burst-dedup removal, no strength re-selection, no orientation interleave,
   * no opener/closer promotion. Just cap to the render budget and apply the
   * template's pacing/motion/transition/crop. This is the product DEFAULT — the
   * smart re-sequence (preserveOrder:false) is offered as a separate
   * "Suggested Edit" variant, never silently.
   */
  preserveOrder?: boolean;
}

// ── Template + length tuning tables ──────────────────────────────────────────

interface TemplateProfile {
  basePaceSec: number; // baseline per-scene hold
  motionVocab: readonly MotionEffect[];
  transitionVocab: readonly TransitionType[];
  transitionSec: number; // per-scene transition length (0 handled by "cut")
  motionIntensity: "subtle" | "medium" | "strong";
  openingHoldBonus: number; // extra seconds on the opening scene
  outroSec: number;
  openingSec: number;
  // Multiplies the length's target duration. Keeps the pace gap REAL for a fixed
  // gallery: fast ends up a shorter, punchier clip; editorial a longer, calmer
  // one — instead of fitToTarget flattening every template to the same runtime.
  targetMult: number;
}

// Three templates that read as three different EDITS, not one edit reskinned.
// The spread is intentional and large along every axis a viewer notices:
//   pace          editorial 3.8s  ▸  cinematic 2.8s  ▸  fast 1.35s   (≈3× gap)
//   motion        gentle/still    ▸  strong pans     ▸  snap punch-ins
//   transitions   slow dissolves  ▸  dramatic leaks  ▸  hard cuts + whips
//   composition   clean full-bleed▸  letterbox+vignette ▸ reel progress bars
const TEMPLATE_PROFILES: Record<StoryTemplate, TemplateProfile> = {
  // Calm gallery/magazine cut: photos breathe, motion is barely-there, cuts are
  // slow cross-dissolves. Lots of deliberate stillness ("none").
  "editorial-clean": {
    basePaceSec: 3.8,
    // Fewer dead-static holds than before (one "none" per 4, not two) so the cut
    // has gentle continuous drift rather than freeze-then-dissolve.
    motionVocab: ["push-in", "pull-out", "none", "push-in"],
    transitionVocab: ["cross-dissolve", "soft-blur"],
    transitionSec: 0.6,
    motionIntensity: "subtle",
    openingHoldBonus: 0.8,
    openingSec: 2.6,
    outroSec: 2.8,
    targetMult: 1.15,
  },
  // Filmic trailer: strong directional motion (pans + big push-ins), dramatic
  // dissolves/light-leaks, letterbox + vignette treatment. Medium-slow pace.
  "cinematic-energy": {
    basePaceSec: 2.8,
    motionVocab: ["push-in", "pan", "focus-zoom", "pan"],
    transitionVocab: ["cross-dissolve", "light-leak", "soft-blur"],
    transitionSec: 0.5,
    motionIntensity: "strong",
    openingHoldBonus: 0.6,
    openingSec: 2.2,
    outroSec: 2.8,
    targetMult: 1.0,
  },
  // Reel/beat montage: very short holds, snap punch-ins, mostly HARD CUTS with
  // the occasional whip. Reads as a punchy social highlights clip.
  "fast-highlights": {
    basePaceSec: 1.35,
    motionVocab: ["punch-in", "none", "punch-in", "focus-zoom"],
    transitionVocab: ["cut", "cut", "whip", "cut"],
    transitionSec: 0.16,
    motionIntensity: "strong",
    openingHoldBonus: 0.2,
    openingSec: 1.6,
    outroSec: 2.0,
    targetMult: 0.72,
  },
};

const LENGTH_TARGETS: Record<StoryLength, { targetSec: number; maxScenes: number }> = {
  short: { targetSec: 15, maxScenes: 10 },
  standard: { targetSec: 30, maxScenes: 20 },
  extended: { targetSec: 55, maxScenes: MAX_SCENES },
};

const PACE_MULT: Record<GlobalPace, number> = {
  relaxed: 1.18,
  balanced: 1.0,
  energetic: 0.82,
};

// ── Tiny deterministic PRNG (mulberry32) ─────────────────────────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Signal helpers ────────────────────────────────────────────────────────────

function hasQualityScores(imgs: PlannerImage[]): boolean {
  return imgs.some((i) => typeof i.storyScore === "number" || typeof i.heroScore === "number");
}

/** Composite "strength" for ranking the opener/closer. Higher = stronger. */
function strengthOf(img: PlannerImage): number {
  let s = 0;
  if (img.isTopPick) s += 5;
  if (typeof img.storyScore === "number" && img.storyScore >= 0) s += (img.storyScore / 10) * 4;
  if (typeof img.heroScore === "number" && img.heroScore >= 0) s += (img.heroScore / 10) * 3;
  return s;
}

/**
 * Resolve the crop/motion focal point (0..1). Priority:
 *   1. AI suggested focal point (if in range)
 *   2. Centroid of the largest face box (subject-aware, keeps faces in frame)
 *   3. Centre (0.5, 0.5)
 */
function resolveFocal(img: PlannerImage): { focal: FocalPoint; reason: string } {
  if (
    typeof img.focalX === "number" &&
    typeof img.focalY === "number" &&
    img.focalX >= 0 &&
    img.focalX <= 1 &&
    img.focalY >= 0 &&
    img.focalY <= 1
  ) {
    return { focal: { x: img.focalX, y: img.focalY }, reason: "ai-focal" };
  }
  if (img.faceBoxes && img.faceBoxes.length > 0) {
    // Area-weighted centroid of ALL faces: a single portrait resolves to that
    // face, and a group resolves to the centre of the crowd (bigger/closer faces
    // pull the frame), which keeps the people-mass in frame on a 9:16 crop.
    let sx = 0, sy = 0, sw = 0;
    for (const b of img.faceBoxes) {
      const a = Math.max(b.w * b.h, 1e-6);
      sx += (b.x + b.w / 2) * a;
      sy += (b.y + b.h / 2) * a;
      sw += a;
    }
    return {
      focal: { x: clamp(sx / sw, 0, 1), y: clamp(sy / sw, 0, 1) },
      reason: "face-centroid",
    };
  }
  // No AI focal / face data: a dead-center crop amputates heads on 9:16 fill,
  // because in most photography the subject/face sits ABOVE center (rule of
  // thirds). Bias the vertical focal into the upper band so a center-cropped
  // portrait keeps the face; landscapes bias a touch less. This is the single
  // highest-value crop fix when no detection data exists.
  const o = orientationOf(img.width, img.height);
  // Faces sit above center in most event photography; bias higher so a 9:16
  // fill-crop of a landscape frame keeps heads (reviewers: y=0.44 still edged
  // faces low on group shots). Landscape needs the strongest upward bias.
  const y = o === "landscape" ? 0.38 : 0.4;
  return { focal: { x: 0.5, y }, reason: "thirds-default" };
}

/**
 * A face box is "edge-risky" if it sits near a frame edge where added motion
 * would crop it — in that case we hold static rather than push/pan into a face.
 */
function faceNearEdge(img: PlannerImage): boolean {
  if (!img.faceBoxes) return false;
  const M = 0.12;
  return img.faceBoxes.some(
    (b) => b.x < M || b.y < M || b.x + b.w > 1 - M || b.y + b.h > 1 - M
  );
}

/**
 * Face-aware fit: an establishing/room shot (detection ran and found only a
 * couple of tiny distant faces, or none) letterboxes so the venue reads; a
 * people beat fills the 9:16 frame and is framed on the detected faces. Falls
 * back to the prior orientation rule when no detection data exists.
 */
function classifyFit(img: PlannerImage): "fit" | "fill" {
  const o = orientationOf(img.width, img.height);
  if (o !== "landscape") return "fill"; // portrait/square already fills 9:16 cleanly
  const faces = Array.isArray(img.faceBoxes) ? img.faceBoxes : null;
  if (faces) {
    let maxA = 0;
    for (const b of faces) maxA = Math.max(maxA, b.w * b.h);
    // Few, tiny (or no) faces => a room/establishing wide => letterbox on the matte.
    if (faces.length <= 2 && maxA < 0.008) return "fit";
    // A 9:16 FILL of a landscape crops WIDTH (height is preserved), so only a
    // face pinned to the LEFT/RIGHT edge risks being cut. With just a subject or
    // two, letterbox to keep it; a crowd tolerates losing an edge face.
    const M = 0.1;
    const horizEdge = faces.some((b) => b.x < M || b.x + b.w > 1 - M);
    if (faces.length <= 4 && horizEdge) return "fit";
    return "fill"; // people beat: fill and frame on the crowd centroid
  }
  // No detection data: keep the prior conservative edge rule.
  return faceNearEdge(img) ? "fit" : "fill";
}

// ── Content signals -> narrative role, arc, motion & transitions ──────────────
// All gated on real detection signals being present; with none, the planner
// keeps its prior template-vocabulary behaviour (see planStory).

/** True once any real content signal (faces) is attached to the set. */
function hasContentSignals(imgs: PlannerImage[]): boolean {
  return imgs.some((im) => typeof im.faceCount === "number" || Array.isArray(im.faceBoxes));
}
function faceCountOf(img: PlannerImage): number {
  return typeof img.faceCount === "number" ? img.faceCount : Array.isArray(img.faceBoxes) ? img.faceBoxes.length : 0;
}
/** Intrinsic role from the signals (position-based hook/closer is set in buildArc). */
function roleOf(img: PlannerImage): "atmosphere" | "people" | "energy" | "peak" {
  const n = faceCountOf(img);
  const maxA = img.maxFaceArea ?? 0;
  if (n <= 2 && maxA < 0.008) return "atmosphere"; // room / establishing wide
  if (n <= 2 || maxA >= 0.011) return "peak"; // a single prominent subject -> intimate portrait
  if (n >= 12) return "people"; // big group
  return "energy"; // medium group / activity
}
function groupStrength(img: PlannerImage): number {
  return faceCountOf(img) * (0.5 + 0.5 * (img.sharpness ?? 0.5));
}

/**
 * Order a selected set into an event arc using real signals:
 *   hook (strongest group) -> establishing room -> people/energy build ->
 *   intimate portrait (peak) -> warm group (closer).
 * Deterministic; falls back silently when a bucket is empty.
 */
function buildArc(imgs: PlannerImage[]): PlannerImage[] {
  const rooms = imgs.filter((i) => roleOf(i) === "atmosphere");
  const portraits = imgs.filter((i) => roleOf(i) === "peak");
  const groups = imgs.filter((i) => roleOf(i) === "people" || roleOf(i) === "energy");

  // hook = strongest group (biggest, sharpest crowd — an immediate scale hook).
  const groupsByStrength = [...groups].sort((a, b) => groupStrength(b) - groupStrength(a));
  const hook = groupsByStrength[0];
  // closer = the strongest EMOTIONAL PAYOFF among the remaining groups: a large
  // crowd carries weight, warmth (golden-hour) breaks ties, and sharpness adds a
  // touch. A generic standing group should not beat a bigger or warmer hero shot.
  const payoff = (g: PlannerImage) =>
    faceCountOf(g) + (g.warmth ?? 0) * 40 + (g.sharpness ?? 0.5) * 1.5;
  const closer =
    [...groups].filter((g) => g !== hook).sort((a, b) => payoff(b) - payoff(a))[0] ?? null;
  const midGroups = groups.filter((g) => g !== hook && g !== closer);

  const out: PlannerImage[] = [];
  if (hook) out.push(hook);
  if (rooms[0]) out.push(rooms[0]); // establishing beat after the hook
  // Interleave the remaining groups with any second room so two mattes never stack.
  const restRooms = rooms.slice(1);
  midGroups.forEach((g, k) => {
    out.push(g);
    if (k === 0 && restRooms[0]) out.push(restRooms[0]);
  });
  restRooms.slice(1).forEach((r) => out.push(r));
  portraits.forEach((p) => out.push(p)); // intimate beat before the close
  if (closer) out.push(closer);
  // Any image not placed (safety) appended in original order.
  for (const im of imgs) if (!out.includes(im)) out.push(im);
  return out;
}

/** Visual family of a motion — used to stop consecutive similar-looking moves. */
function motionFamily(m: MotionEffect): "in" | "out" | "lateral" | "reveal" | "still" {
  if (m === "push-in" || m === "focus-zoom" || m === "punch-in") return "in";
  if (m === "pull-out") return "out";
  if (m === "pan" || m === "parallax") return "lateral";
  if (m === "reveal") return "reveal";
  return "still";
}

/** Face-aware pan direction: pan toward the side the subject sits on. */
function panDirTowardSubject(img: PlannerImage): "left" | "right" {
  const { focal } = resolveFocal(img);
  return focal.x < 0.5 ? "left" : "right";
}

/** Role- and position-aware motion (used when signals are present). */
function motionForScene(
  img: PlannerImage,
  i: number,
  n: number,
  rng: () => number
): { motion: MotionEffect; intensity: MotionIntensity; direction: MotionDirection } {
  const role = roleOf(img);
  const isCloser = i === n - 1;
  if (role === "atmosphere") {
    // Wide establishing shot on the matte: a slow cinematic push or two-plane drift.
    return { motion: rng() < 0.5 ? "push-in" : "parallax", intensity: "subtle", direction: panDirTowardSubject(img) };
  }
  if (role === "peak") {
    // Intimate portrait: hold still or a barely-there push; never pan across a face.
    return { motion: rng() < 0.5 ? "none" : "push-in", intensity: "subtle", direction: "up" };
  }
  if (isCloser) {
    return { motion: "pull-out", intensity: "medium", direction: "down" }; // breathe out on the close
  }
  // People / energy beat: alternate a push with a face-aware pan for life.
  return {
    motion: i % 2 === 0 ? "push-in" : "pan",
    intensity: "medium",
    direction: panDirTowardSubject(img),
  };
}

/** Content-aware transition INTO scene i (used when signals are present). */
function transitionForScene(
  prev: PlannerImage | null,
  cur: PlannerImage,
  profile: TemplateProfile
): TransitionType {
  if (!prev) return "cross-dissolve";
  const rPrev = roleOf(prev);
  const rCur = roleOf(cur);
  const fast = profile.motionIntensity === "strong"; // fast-highlights template
  if (rPrev === "atmosphere" && rCur === "atmosphere") return "match-cut"; // two similar wides
  if (rCur === "energy") return fast ? "whip" : "slide"; // stepping up energy
  if (rCur === "atmosphere") return "soft-blur"; // settle into an establishing shot
  if (rCur === "peak") return "cross-dissolve"; // gentle into the portrait
  return fast ? "cut" : "cross-dissolve";
}

// ── Burst de-duplication ──────────────────────────────────────────────────────
// Photos captured within BURST_SEC of each other with the same orientation are
// treated as one "moment"; we keep only the strongest so the story doesn't show
// three near-identical frames in a row.
const BURST_SEC = 3;

function dedupeBursts(imgs: PlannerImage[]): PlannerImage[] {
  const withTime = imgs.filter((i) => i.capturedAt);
  if (withTime.length < 2) return imgs; // no reliable time data -> skip

  const out: PlannerImage[] = [];
  let group: PlannerImage[] = [];
  let lastT = Number.NEGATIVE_INFINITY;
  let lastO: Orientation | null = null;

  const flush = () => {
    if (group.length === 0) return;
    let best = group[0];
    for (const g of group) if (strengthOf(g) > strengthOf(best)) best = g;
    out.push(best);
    group = [];
  };

  for (const img of imgs) {
    const t = img.capturedAt ? Date.parse(img.capturedAt) : NaN;
    const o = orientationOf(img.width, img.height);
    if (!Number.isNaN(t) && lastT !== Number.NEGATIVE_INFINITY && o === lastO && Math.abs(t - lastT) <= BURST_SEC * 1000) {
      group.push(img);
    } else {
      flush();
      group.push(img);
    }
    lastT = Number.isNaN(t) ? lastT : t;
    lastO = o;
  }
  flush();
  return out;
}

// ── Anti-monotony interleave ──────────────────────────────────────────────────
// Reorder so no more than 2 consecutive scenes share the same orientation,
// pulling forward the next differently-oriented image when possible. Stable +
// deterministic.
function interleaveByOrientation(imgs: PlannerImage[]): PlannerImage[] {
  const result: PlannerImage[] = [];
  const pool = imgs.slice();
  let runOrientation: Orientation | null = null;
  let runLen = 0;

  while (pool.length > 0) {
    let idx = 0;
    if (runLen >= 2 && runOrientation) {
      const alt = pool.findIndex((i) => orientationOf(i.width, i.height) !== runOrientation);
      if (alt !== -1) idx = alt;
    }
    const chosen = pool.splice(idx, 1)[0];
    const o = orientationOf(chosen.width, chosen.height);
    if (o === runOrientation) runLen += 1;
    else {
      runOrientation = o;
      runLen = 1;
    }
    result.push(chosen);
  }
  return result;
}

// Deterministic run-breaker: eliminates runs of >2 same-orientation scenes by
// swapping the 3rd offender with the next interior scene of a different
// orientation. Never moves index 0 (opener) or the last element (closer). Stable
// and idempotent enough for our sizes; if no swap candidate exists the run is
// left (unavoidable given the available orientation mix).
function breakOrientationRuns(list: PlannerImage[]): void {
  const orient = (im: PlannerImage) => orientationOf(im.width, im.height);
  for (let i = 2; i < list.length; i++) {
    if (orient(list[i]) === orient(list[i - 1]) && orient(list[i - 1]) === orient(list[i - 2])) {
      let j = -1;
      for (let k = i + 1; k < list.length - 1; k++) {
        if (orient(list[k]) !== orient(list[i])) { j = k; break; }
      }
      if (j !== -1) {
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
    }
  }
}

// Per-scene motion intensity, so a template isn't 100% one setting (reviewers:
// "constant strong reads as a filter, not craft"). Gives motion dynamic range —
// a gentle peak on the opener + top picks, medium elsewhere. Deterministic
// (driven by the seeded rng passed in).
function variedIntensity(
  base: "subtle" | "medium" | "strong",
  i: number,
  isTopPick: boolean,
  rng: () => number
): "subtle" | "medium" | "strong" {
  if (base === "subtle") {
    if (i === 0 || isTopPick) return "medium";
    return rng() < 0.22 ? "medium" : "subtle";
  }
  if (base === "strong") {
    if (i === 0 || isTopPick) return "strong";
    return rng() < 0.5 ? "medium" : "strong"; // ~half medium → not a constant push
  }
  return i % 3 === 0 || isTopPick ? "strong" : "medium";
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function planStory(images: PlannerImage[], opts: PlannerOptions): ScenePlan {
  const template: StoryTemplate = opts.template ?? "editorial-clean";
  const length: StoryLength = opts.length ?? "standard";
  const pace: GlobalPace = opts.pace ?? "balanced";
  const profile = TEMPLATE_PROFILES[template];
  const lengthTarget = LENGTH_TARGETS[length];
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed);

  const preserveOrder = opts.preserveOrder ?? false;

  // 1. Stable base order: photographer's sort order is the source of truth.
  const base = images.slice().sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  const usingScores = hasQualityScores(base);

  let ordered: PlannerImage[];
  if (preserveOrder) {
    // LOCKED ORDER: keep the photographer's exact sequence, only cap to budget.
    // No dedupe removal, no re-selection, no interleave, no opener/closer moves.
    const budget = Math.min(base.length, lengthTarget.maxScenes, RENDER_MAX_SCENES, MAX_SCENES);
    ordered = base.slice(0, budget);
  } else {
    // SUGGESTED EDIT: the smart re-sequence.
    // 2. Burst de-dup (only when capture time exists).
    const deduped = dedupeBursts(base);
    // 3. Budget cap (first-release render limit).
    const budget = Math.min(deduped.length, lengthTarget.maxScenes, RENDER_MAX_SCENES, MAX_SCENES);
    // 4. Selection: if we must trim, keep the strongest while preserving order.
    let selected: PlannerImage[];
    if (deduped.length <= budget) {
      selected = deduped;
    } else if (usingScores) {
      const ranked = deduped
        .map((img, i) => ({ img, i, s: strengthOf(img) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, budget)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.img);
      selected = ranked;
    } else {
      const picks = deduped.filter((i) => i.isTopPick);
      const rest = deduped.filter((i) => !i.isTopPick);
      const room = Math.max(0, budget - picks.length);
      const sampled: PlannerImage[] = [];
      if (room > 0 && rest.length > 0) {
        const step = rest.length / room;
        for (let k = 0; k < room; k++) sampled.push(rest[Math.floor(k * step)]);
      }
      const chosen = new Set([...picks, ...sampled].map((i) => i.id));
      selected = deduped.filter((i) => chosen.has(i.id)).slice(0, budget);
    }
    // 5. Ordering. With real content signals, build a proper event arc
    // (hook -> establishing -> build -> portrait -> warm close); otherwise fall
    // back to orientation interleave + strongest opener/closer promotion.
    if (hasContentSignals(selected)) {
      ordered = buildArc(selected);
    } else {
    ordered = interleaveByOrientation(selected);
    // 6. Promote the strongest image to the opening slot (respecting Top Picks).
    if (ordered.length > 1) {
      let bestIdx = 0;
      for (let i = 1; i < ordered.length; i++) {
        if (strengthOf(ordered[i]) > strengthOf(ordered[bestIdx])) bestIdx = i;
      }
      if (bestIdx !== 0) {
        const [opener] = ordered.splice(bestIdx, 1);
        ordered.unshift(opener);
      }
    }
    // 7. Ensure a strong closer: move the 2nd-strongest to the end.
    if (ordered.length > 3) {
      let bestIdx = 1;
      for (let i = 2; i < ordered.length - 1; i++) {
        if (strengthOf(ordered[i]) > strengthOf(ordered[bestIdx])) bestIdx = i;
      }
      const [closer] = ordered.splice(bestIdx, 1);
      ordered.push(closer);
    }
    }
  }

  // 7b. Promoting the opener/closer can re-introduce a 3-in-a-row orientation
  // run (esp. once trimming to the render cap skews the portrait/landscape mix).
  // Break any such run with a deterministic interior swap, keeping the pinned
  // opener (index 0) and closer (last) in place. Skipped in locked-order mode —
  // it reorders, which would violate the photographer's locked sequence.
  if (!preserveOrder) breakOrientationRuns(ordered);

  // 8. Build scenes with motion/transition variety + subject-aware crop.
  // Built imperatively (not via .map) so each scene can look back at the
  // previous one to avoid repeating motion/transition.
  const paceSec = profile.basePaceSec * PACE_MULT[pace];
  const scenes: Scene[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const img = ordered[i];
    const prev = i > 0 ? scenes[i - 1] : null;
    const o = orientationOf(img.width, img.height);
    const { focal, reason: focalReason } = resolveFocal(img);

    // Motion: cycle template vocab with a seeded shift so the pattern isn't a
    // strict, predictable period; hold static if motion would crop a face, and
    // never repeat the exact same motion twice in a row.
    const mShift = rng() < 0.3 ? 1 : 0;
    let motion: MotionEffect = profile.motionVocab[(i + mShift) % profile.motionVocab.length];
    // Never repeat the exact same (non-static) motion twice in a row: step
    // through the vocab until it differs (or we exhaust it).
    for (let k = 1; k <= profile.motionVocab.length && prev && motion === prev.motion && motion !== "none"; k++) {
      motion = profile.motionVocab[(i + mShift + k) % profile.motionVocab.length];
    }
    // Motions that settle at (or reveal) rest scale don't crop a near-edge face;
    // only the continuous inward moves do, so hold static for those.
    if (
      faceNearEdge(img) &&
      motion !== "none" &&
      motion !== "focus-zoom" &&
      motion !== "punch-in"
    ) {
      motion = "none";
    }

    // Direction: landscape leans horizontal pan, portrait leans vertical.
    let dir: MotionDirection =
      motion === "pan"
        ? o === "landscape"
          ? i % 2 === 0
            ? "left"
            : "right"
          : i % 2 === 0
            ? "up"
            : "down"
        : i % 2 === 0
          ? "up"
          : "down";

    // Transition: cycle template vocab with a seeded shift so flashy transitions
    // (whip / light-leak) don't land on a fixed metronome. Avoid immediate repeat
    // — EXCEPT "cut", where back-to-back hard cuts are the fast-highlights rhythm.
    const tShift = rng() < 0.35 ? 1 : 0;
    let transition: TransitionType =
      i === 0 ? "cross-dissolve" : profile.transitionVocab[(i + tShift) % profile.transitionVocab.length];
    if (prev && transition === prev.transitionIn && transition !== "cut") {
      transition = profile.transitionVocab[(i + tShift + 1) % profile.transitionVocab.length];
    }

    // V2 intelligence: with real content signals, choose motion + transition by
    // the scene's narrative role (portraits hold, wides drift cinematically,
    // people beats pan toward the crowd, the close breathes out) and mark the
    // arc role. Without signals, keep the template-vocab behaviour computed above.
    let intensity: MotionIntensity = variedIntensity(profile.motionIntensity, i, Boolean(img.isTopPick), rng);
    let role: SceneRole | undefined;
    if (hasContentSignals(ordered)) {
      const m = motionForScene(img, i, ordered.length, rng);
      motion = m.motion;
      dir = m.direction;
      intensity = m.intensity;
      const intrinsic = roleOf(img);
      role = i === 0 ? "hook" : i === ordered.length - 1 ? "closer" : intrinsic;
      // Motion-diversity budget: never repeat the SAME visual family two scenes
      // in a row (a run of push-ins reads canned). The closer keeps its pull-out.
      if (prev && role !== "closer" && motionFamily(motion) === motionFamily(prev.motion)) {
        if (role === "peak") {
          motion = "none"; // hold the portrait still — a nicer contrast than repeating
        } else {
          const alts: MotionEffect[] = role === "atmosphere" ? ["parallax", "pull-out", "push-in"] : ["pan", "pull-out", "push-in", "parallax"];
          const alt = alts.find((a) => motionFamily(a) !== motionFamily(prev.motion));
          if (alt) {
            motion = alt;
            if (alt === "pan" || alt === "parallax") dir = panDirTowardSubject(img);
          }
        }
      }
      transition = i === 0 ? "cross-dissolve" : transitionForScene(ordered[i - 1], img, profile);
    }

    // Fit: face-aware — letterbox establishing/room wides so the venue reads,
    // fill people beats and frame them on the detected faces.
    const fit = classifyFit(img);
    const background = fit === "fit" ? "blur" : "none";

    // Duration: base pace, longer hold on the opener, slight lift for top picks.
    let dur = paceSec;
    if (i === 0) dur += profile.openingHoldBonus;
    if (img.isTopPick) dur += 0.3;
    dur = clamp(dur, MIN_SCENE_SEC, MAX_SCENE_SEC);

    scenes.push({
      id: `sc_${i}_${img.id.slice(0, 8)}`,
      imageId: img.id,
      width: img.width,
      height: img.height,
      durationSec: Math.round(dur * 100) / 100,
      fit,
      background,
      focal,
      motion,
      motionDirection: dir,
      motionIntensity: intensity,
      transitionIn: transition,
      transitionDurationSec: transition === "cut" ? 0 : transition === "match-cut" ? Math.min(0.25, profile.transitionSec) : profile.transitionSec,
      role,
      locked: false,
      text: null,
      _reason: [
        i === 0 ? "opening(strongest)" : i === ordered.length - 1 ? "closer" : "body",
        `orient:${o}`,
        `focal:${focalReason}`,
        img.isTopPick ? "toppick" : usingScores ? `story:${img.storyScore ?? "-"}` : "seq",
        `motion:${motion}`,
      ].join(" "),
    });
  }

  // 9. Nudge total toward the length target within clamps (proportional). The
  // template's targetMult keeps the pace difference real: fast finishes shorter.
  // Clamp the target to the FIRST-RELEASE render duration cap (minus a rounding
  // margin) so an auto plan is always renderable synchronously — never orphans
  // a job by exceeding the 45s ceiling (e.g. extended editorial would be ~63s).
  const cardsSec = profile.openingSec + profile.outroSec;
  const cappedTarget = Math.min(
    lengthTarget.targetSec * profile.targetMult,
    RENDER_MAX_DURATION_SEC - Math.max(1, cardsSec * 0.1)
  );
  fitToTarget(scenes, cappedTarget, profile);

  // 10. Title cards from event + brand.
  const opening: TitleCard = {
    kind: "opening",
    enabled: Boolean(opts.event?.title || opts.brand.studioName),
    title: opts.event?.title ?? opts.brand.studioName ?? undefined,
    subtitle: buildSubtitle(opts.event),
    showLogo: Boolean(opts.brand.logoUrl),
    durationSec: profile.openingSec,
  };
  const outro: TitleCard = {
    kind: "outro",
    enabled: true,
    title: opts.brand.studioName ?? undefined,
    subtitle: opts.event?.date ? undefined : opts.event?.location ?? undefined,
    showLogo: Boolean(opts.brand.logoUrl),
    durationSec: profile.outroSec,
  };

  // touch rng so the seed is meaningfully consumed for future tie-breaks
  void rng;

  return {
    version: SCENE_PLAN_VERSION,
    galleryId: opts.galleryId,
    format: "9:16",
    template,
    length,
    pace,
    fps: STORY_FPS,
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    opening,
    outro,
    scenes,
    brand: opts.brand,
    music: null,
    generatedBy: "auto",
    planSeed: seed,
  };
}

function buildSubtitle(ev?: PlannerEvent): string | undefined {
  if (!ev) return undefined;
  const parts = [ev.date, ev.location].filter(Boolean) as string[];
  return parts.length ? parts.join("  ·  ") : undefined;
}

/** Scale scene durations toward targetSec, staying within per-scene clamps. */
function fitToTarget(scenes: Scene[], targetSec: number, profile: TemplateProfile): void {
  if (scenes.length === 0) return;
  const cardsSec = profile.openingSec + profile.outroSec;
  const scenesTarget = Math.max(scenes.length * MIN_SCENE_SEC, targetSec - cardsSec);
  const current = scenes.reduce((s, sc) => s + sc.durationSec, 0);
  if (current <= 0) return;
  const factor = scenesTarget / current;
  if (Math.abs(factor - 1) < 0.02) return;
  for (const sc of scenes) {
    sc.durationSec = Math.round(clamp(sc.durationSec * factor, MIN_SCENE_SEC, MAX_SCENE_SEC) * 100) / 100;
  }
}

// re-export for convenience
export { MIN_SCENES, MAX_SCENES };
