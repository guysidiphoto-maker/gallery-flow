import type { PlannerImage } from "../planner";
import { MAX_SCENE_SEC, MIN_SCENE_SEC, clamp, orientationOf, type Scene, type ScenePlan } from "../sceneplan";

export type SrcById = Map<string, string>;

/** Attach preview-only image URLs (never persisted) for the Player + thumbnails. */
export function withPreviewSrc(plan: ScenePlan, srcById: SrcById): ScenePlan {
  return { ...plan, scenes: plan.scenes.map((s) => ({ ...s, src: srcById.get(s.imageId), collageSrc: s.collageImageIds?.map((i) => srcById.get(i)!).filter(Boolean) })) };
}

export function swapScenes(scenes: Scene[], id: string, dir: -1 | 1): Scene[] | null {
  const idx = scenes.findIndex((s) => s.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= scenes.length) return null;
  const next = scenes.slice();
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

export function moveSceneTo(scenes: Scene[], fromId: string, toId: string): Scene[] | null {
  if (fromId === toId) return null;
  const from = scenes.findIndex((s) => s.id === fromId);
  const to = scenes.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0) return null;
  const next = scenes.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function duplicateSceneIn(scenes: Scene[], id: string): Scene[] | null {
  const idx = scenes.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const src = scenes[idx];
  // Probe for a free suffix: a length-based one can collide after removals, and
  // the validator rejects duplicate ids.
  const existing = new Set(scenes.map((s) => s.id));
  let n = 1;
  let newId = `${src.imageId.slice(0, 8)}_dup${n}`;
  while (existing.has(newId)) newId = `${src.imageId.slice(0, 8)}_dup${++n}`;
  const next = scenes.slice();
  next.splice(idx + 1, 0, { ...src, id: newId });
  return next;
}

/**
 * A landscape scene merges with the next 1–2 adjacent landscape scenes into a
 * stacked collage; a collage splits back into singles. Null = nothing to do.
 */
export function toggleCollageIn(scenes: Scene[], id: string, srcById: SrcById): Scene[] | null {
  const idx = scenes.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const s = scenes[idx];
  const next = scenes.slice();
  if (s.layout === "collage" && s.collageImageIds?.length) {
    const existing = new Set(scenes.map((x) => x.id));
    const singles: Scene[] = s.collageImageIds.map((imgId, k) => {
      let nid = k === 0 ? s.id : `${imgId.slice(0, 8)}_c${k}`;
      while (k !== 0 && existing.has(nid)) nid = `${imgId.slice(0, 8)}_c${k}_${Math.floor(k * 7 + 1)}`;
      existing.add(nid);
      return { ...s, id: nid, imageId: imgId, src: srcById.get(imgId), layout: "single", collageImageIds: undefined, collageSrc: undefined };
    });
    next.splice(idx, 1, ...singles);
  } else if (orientationOf(s.width, s.height) === "landscape") {
    const group = [s];
    let j = idx + 1;
    while (j < scenes.length && group.length < 3 && scenes[j].layout !== "collage" && orientationOf(scenes[j].width, scenes[j].height) === "landscape") {
      group.push(scenes[j]);
      j++;
    }
    if (group.length < 2) return null;
    const ids = group.map((g) => g.imageId);
    const collage: Scene = { ...s, layout: "collage", collageImageIds: ids, collageSrc: ids.map((i) => srcById.get(i)).filter((x): x is string => Boolean(x)), motion: "push-in", motionIntensity: "subtle" };
    next.splice(idx, group.length, collage);
  } else {
    return null;
  }
  return next;
}

/** A fresh scene for a gallery photo appended by hand. */
export function sceneForAddedPhoto(img: PlannerImage, sceneCount: number): Scene {
  const landscape = orientationOf(img.width, img.height) === "landscape";
  return {
    id: `sc_add_${img.id.slice(0, 8)}_${sceneCount}`,
    imageId: img.id,
    src: img.src,
    width: img.width,
    height: img.height,
    durationSec: clamp(3.0, MIN_SCENE_SEC, MAX_SCENE_SEC),
    fit: landscape ? "fit" : "fill",
    background: landscape ? "blur" : "none",
    focal: { x: 0.5, y: 0.5 },
    motion: "push-in",
    motionDirection: "up",
    motionIntensity: "subtle",
    transitionIn: "cross-dissolve",
    transitionDurationSec: 0.4,
    text: null,
  };
}
