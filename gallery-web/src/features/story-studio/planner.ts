// Deterministic auto-editor: turns gallery photos into a ScenePlan that feels edited, not shuffled.
// Uses quality/face metadata only when present and in range — never invents scores. A seeded PRNG
// drives the few "pick one of N" choices so the same input yields byte-identical output.

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
  /** Preview URL; ignored by planning, used by the editor for the live preview. */
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
  // Content signals from the image pipeline; when present they drive arc, motion and transitions.
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
   * Keep the photographer's exact order (no dedupe, re-selection or reordering) and only cap to
   * the render budget. The smart re-sequence is offered separately as a "Suggested Edit".
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
  // Scales the length target so fitToTarget doesn't flatten every template to one runtime.
  targetMult: number;
}

// Three templates that read as different edits, not one reskinned: a deliberately wide spread in
// pace, motion and transitions.
const TEMPLATE_PROFILES: Record<StoryTemplate, TemplateProfile> = {
  // Calm magazine cut: slow dissolves, barely-there motion.
  "editorial-clean": {
    basePaceSec: 3.8,
    // One "none" per 4 keeps gentle drift rather than freeze-then-dissolve.
    motionVocab: ["push-in", "pull-out", "none", "push-in"],
    transitionVocab: ["cross-dissolve", "soft-blur"],
    transitionSec: 0.6,
    motionIntensity: "subtle",
    openingHoldBonus: 0.8,
    openingSec: 2.6,
    outroSec: 2.8,
    targetMult: 1.15,
  },
  // Filmic trailer: strong pans/push-ins, dissolves and light-leaks.
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
  // Reel montage: short holds, punch-ins, mostly hard cuts with the odd whip.
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

/** Crop/motion focal point: AI focal if in range, else face centroid, else a thirds-biased default. */
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
    // Area-weighted centroid of all faces keeps the people-mass in frame on a 9:16 crop.
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
  // Faces usually sit above center, so a dead-center 9:16 crop cuts heads; bias upward,
  // landscapes most strongly.
  const o = orientationOf(img.width, img.height);
  const y = o === "landscape" ? 0.38 : 0.4;
  return { focal: { x: 0.5, y }, reason: "thirds-default" };
}

/** A face near a frame edge would be cropped by motion, so such scenes hold static. */
function faceNearEdge(img: PlannerImage): boolean {
  if (!img.faceBoxes) return false;
  const M = 0.12;
  return img.faceBoxes.some(
    (b) => b.x < M || b.y < M || b.x + b.w > 1 - M || b.y + b.h > 1 - M
  );
}

function classifyFit(_img: PlannerImage, _template: StoryTemplate): "fit" | "fill" {
  // Auto cuts are always full-bleed: letterbox reads as "broken" to clients, so it stays a
  // deliberate per-scene choice in the editor.
  return "fill";
}

// ── Content signals -> narrative role, arc, motion & transitions ──────────────
// Only used when detection signals exist; otherwise planStory uses template vocabularies.

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

/** Event arc: hook (strongest group) -> establishing room -> build -> portraits -> warm closer. */
function buildArc(imgs: PlannerImage[]): PlannerImage[] {
  const rooms = imgs.filter((i) => roleOf(i) === "atmosphere");
  const portraits = imgs.filter((i) => roleOf(i) === "peak");
  const groups = imgs.filter((i) => roleOf(i) === "people" || roleOf(i) === "energy");

  const groupsByStrength = [...groups].sort((a, b) => groupStrength(b) - groupStrength(a));
  const hook = groupsByStrength[0];
  // Closer = strongest emotional payoff: crowd size, then warmth, then sharpness.
  const payoff = (g: PlannerImage) =>
    faceCountOf(g) + (g.warmth ?? 0) * 40 + (g.sharpness ?? 0.5) * 1.5;
  const closer =
    [...groups].filter((g) => g !== hook).sort((a, b) => payoff(b) - payoff(a))[0] ?? null;
  const midGroups = groups.filter((g) => g !== hook && g !== closer);

  // One establishing shot is enough; extra room wides read as redundant padding.
  const bestRoom = rooms.length ? [...rooms].sort((a, b) => (b.sharpness ?? 0) - (a.sharpness ?? 0))[0] : null;

  // Interleave groups and portraits so close-ups never clump into one block; groups go first
  // in each pair so portraits lean toward the close.
  const mid: PlannerImage[] = [];
  const a = [...midGroups];
  const b = [...portraits];
  while (a.length || b.length) {
    if (a.length) mid.push(a.shift()!);
    if (b.length) mid.push(b.shift()!);
  }
  const out: PlannerImage[] = [];
  if (hook) out.push(hook);
  if (bestRoom) out.push(bestRoom); // establishing beat after the hook
  mid.forEach((m) => out.push(m));
  if (closer) out.push(closer);
  // Append any unplaced group/portrait (extra rooms stay dropped), keeping the closer last.
  const tail = out.length ? out.pop()! : null;
  for (const im of imgs) if (!out.includes(im) && im !== tail && roleOf(im) !== "atmosphere") out.push(im);
  if (tail) out.push(tail);
  return out;
}

/**
 * Merge runs of landscape scenes into 2-3-up vertical collages (a lone landscape in 9:16 crops
 * hard or shows bars). Hook, closer and portraits stay single. Mutates `scenes`.
 */
function mergeLandscapeCollages(scenes: Scene[]): void {
  const eligible = (s: Scene) =>
    s.layout !== "collage" &&
    orientationOf(s.width, s.height) === "landscape" &&
    s.role !== "hook" &&
    s.role !== "closer" &&
    s.role !== "peak"; // portraits/intimate beats stay full-frame
  let i = 0;
  while (i < scenes.length) {
    if (!eligible(scenes[i])) { i++; continue; }
    // Greedily take up to 3 consecutive eligible landscapes.
    let j = i;
    const group: Scene[] = [];
    while (j < scenes.length && group.length < 3 && eligible(scenes[j])) {
      group.push(scenes[j]);
      j++;
    }
    if (group.length >= 2) {
      const first = group[0];
      const avg = group.reduce((a, s) => a + s.durationSec, 0) / group.length;
      const collage: Scene = {
        ...first,
        layout: "collage",
        collageImageIds: group.map((s) => s.imageId),
        // A collage shows 2-3 photos, so hold a touch longer than a single beat.
        durationSec: clamp(Math.round(avg * 1.35 * 100) / 100, MIN_SCENE_SEC, MAX_SCENE_SEC),
        motion: "push-in",
        motionIntensity: "subtle",
        _reason: `collage(${group.length} landscapes)`,
      };
      scenes.splice(i, group.length, collage);
      i++; // move past the new collage
    } else {
      i = j; // a lone eligible landscape stays single
    }
  }
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
  rng: () => number,
  template: StoryTemplate
): { motion: MotionEffect; intensity: MotionIntensity; direction: MotionDirection } {
  const role = roleOf(img);
  const isCloser = i === n - 1;
  const energetic = template !== "editorial-clean"; // reel-style: keep everything moving
  if (role === "atmosphere") {
    // Wide establishing shot: a slow cinematic push or two-plane drift.
    return { motion: rng() < 0.5 ? "push-in" : "parallax", intensity: energetic ? "medium" : "subtle", direction: panDirTowardSubject(img) };
  }
  if (role === "peak") {
    // Editorial holds portraits still; energetic reels keep a gentle move against the beat.
    if (energetic) return { motion: i % 2 === 0 ? "push-in" : "pull-out", intensity: "medium", direction: "up" };
    return { motion: rng() < 0.5 ? "none" : "push-in", intensity: "subtle", direction: "up" };
  }
  if (isCloser) {
    return { motion: "pull-out", intensity: "medium", direction: "down" }; // breathe out on the close
  }
  // People/energy beats cycle moves so people-dense events stay dynamic.
  const cycle: MotionEffect[] = ["push-in", "pan", "parallax"];
  const m = cycle[i % cycle.length];
  return {
    motion: m,
    intensity: "medium",
    direction: m === "pan" || m === "parallax" ? panDirTowardSubject(img) : "up",
  };
}

/** Dark, crowd-dense events (concerts, parties) get cinematic-energy; calmer ones stay editorial. */
export function recommendTemplate(images: PlannerImage[]): StoryTemplate {
  if (!hasContentSignals(images)) return "editorial-clean";
  const withB = images.filter((i) => typeof i.brightness === "number");
  const avgBright = withB.length ? withB.reduce((s, i) => s + (i.brightness ?? 0.5), 0) / withB.length : 0.5;
  const crowdFrac = images.filter((i) => faceCountOf(i) >= 10).length / Math.max(1, images.length);
  const energy = (1 - avgBright) * 0.5 + crowdFrac * 0.6;
  return energy >= 0.42 ? "cinematic-energy" : "editorial-clean";
}

/** Content-aware transition INTO scene i (used when signals are present). */
function transitionForScene(
  prev: PlannerImage | null,
  cur: PlannerImage,
  template: StoryTemplate
): TransitionType {
  if (!prev) return "cross-dissolve";
  const rPrev = roleOf(prev);
  const rCur = roleOf(cur);
  const veryFast = template === "fast-highlights";
  const energetic = template !== "editorial-clean"; // cinematic + fast reels
  if (rPrev === "atmosphere" && rCur === "atmosphere") return "match-cut"; // two similar wides
  if (rCur === "energy") return energetic ? "whip" : "slide"; // stepping up energy -> whip on reels
  if (rCur === "atmosphere") return "soft-blur"; // settle into an establishing shot
  if (rCur === "peak") return energetic ? (veryFast ? "cut" : "whip") : "cross-dissolve"; // reels punch into peaks
  return veryFast ? "cut" : "cross-dissolve";
}

// ── Burst de-duplication ──────────────────────────────────────────────────────
// Same-orientation photos within BURST_SEC are one moment; keep only the strongest.
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
// At most 2 consecutive scenes share an orientation, pulling the next different one forward.
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

// Break runs of >2 same-orientation scenes by swapping with the next interior scene of another
// orientation. Never moves the opener or the closer.
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

// Vary intensity per scene: a constant setting reads as a filter, not craft.
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
    // Locked order: only cap to budget.
    const budget = Math.min(base.length, lengthTarget.maxScenes, RENDER_MAX_SCENES, MAX_SCENES);
    ordered = base.slice(0, budget);
  } else {
    // Suggested edit: the smart re-sequence.
    // 2. Burst de-dup (only when capture time exists).
    const deduped = dedupeBursts(base);
    // 3. Budget cap (render limit).
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

  // 7b. Opener/closer promotion can re-introduce orientation runs. Never in locked-order mode.
  if (!preserveOrder) breakOrientationRuns(ordered);

  // 8. Build scenes imperatively so each can look back and avoid repeating motion/transition.
  const paceSec = profile.basePaceSec * PACE_MULT[pace];
  const scenes: Scene[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const img = ordered[i];
    const prev = i > 0 ? scenes[i - 1] : null;
    const o = orientationOf(img.width, img.height);
    const { focal, reason: focalReason } = resolveFocal(img);

    // Seeded shift so the motion cycle isn't a predictable period.
    const mShift = rng() < 0.3 ? 1 : 0;
    let motion: MotionEffect = profile.motionVocab[(i + mShift) % profile.motionVocab.length];
    // Never repeat the same non-static motion twice in a row.
    for (let k = 1; k <= profile.motionVocab.length && prev && motion === prev.motion && motion !== "none"; k++) {
      motion = profile.motionVocab[(i + mShift + k) % profile.motionVocab.length];
    }
    // Only continuous inward moves crop a near-edge face; hold static for those.
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

    // Seeded shift keeps flashy transitions off a metronome. Avoid immediate repeats except
    // "cut" — back-to-back hard cuts are the fast-highlights rhythm.
    const tShift = rng() < 0.35 ? 1 : 0;
    let transition: TransitionType =
      i === 0 ? "cross-dissolve" : profile.transitionVocab[(i + tShift) % profile.transitionVocab.length];
    if (prev && transition === prev.transitionIn && transition !== "cut") {
      transition = profile.transitionVocab[(i + tShift + 1) % profile.transitionVocab.length];
    }

    // With content signals, motion and transition follow the scene's narrative role.
    let intensity: MotionIntensity = variedIntensity(profile.motionIntensity, i, Boolean(img.isTopPick), rng);
    let role: SceneRole | undefined;
    if (hasContentSignals(ordered)) {
      const energetic = template !== "editorial-clean";
      const m = motionForScene(img, i, ordered.length, rng, template);
      motion = m.motion;
      dir = m.direction;
      intensity = m.intensity;
      const intrinsic = roleOf(img);
      role = i === 0 ? "hook" : i === ordered.length - 1 ? "closer" : intrinsic;
      // Never repeat a motion family twice in a row (reads canned); the closer keeps its pull-out.
      if (prev && role !== "closer" && motionFamily(motion) === motionFamily(prev.motion)) {
        if (role === "peak" && !energetic) {
          motion = "none"; // calm editorial: hold the portrait still
        } else {
          // Peaks avoid a pan across a face; wides/people may pan/parallax.
          const alts: MotionEffect[] =
            role === "peak" ? ["push-in", "pull-out", "parallax"] : role === "atmosphere" ? ["parallax", "pull-out", "push-in"] : ["pan", "pull-out", "push-in", "parallax"];
          const alt = alts.find((a) => motionFamily(a) !== motionFamily(prev.motion));
          if (alt) {
            motion = alt;
            if (alt === "pan" || alt === "parallax") dir = panDirTowardSubject(img);
          }
        }
      }
      transition = i === 0 ? "cross-dissolve" : transitionForScene(ordered[i - 1], img, template);
      // Break a run of 3 identical transitions with a restrained alternate.
      const prev2 = i >= 2 ? scenes[i - 2] : null;
      if (prev && prev2 && prev.transitionIn === transition && prev2.transitionIn === transition && transition !== "cut") {
        transition = transition === "cross-dissolve" ? "soft-blur" : "cross-dissolve";
      }
    }

    const fit = classifyFit(img, template);
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

  // 8b. Landscape collages.
  mergeLandscapeCollages(scenes);

  // 9. Nudge total toward the length target, capped below the render duration limit so an auto
  // plan is always renderable synchronously.
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
