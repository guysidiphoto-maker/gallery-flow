import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_PLAN_VERSION,
  upgradeScenePlan,
  applyBeatSync,
  validateScenePlan,
  MOTION_EFFECTS,
  TRANSITIONS,
  CAPTION_STYLES,
  type Scene,
  type ScenePlan,
} from "./sceneplan.ts";

test("scene plan version is 2 (v2 vocabulary present)", () => {
  assert.equal(SCENE_PLAN_VERSION, 2);
  for (const m of ["parallax", "reveal"]) assert.ok(MOTION_EFFECTS.includes(m as any), `motion ${m}`);
  for (const t of ["fade-color", "masked-reveal", "match-cut"]) assert.ok(TRANSITIONS.includes(t as any), `transition ${t}`);
  assert.deepEqual([...CAPTION_STYLES], ["editorial", "bold", "minimal"]);
});

test("upgradeScenePlan lifts a v1 plan to the current version losslessly", () => {
  const v1 = { version: 1, galleryId: "g", scenes: [{ id: "a" }], template: "editorial-clean" };
  const up = upgradeScenePlan(v1);
  assert.equal(up.version, SCENE_PLAN_VERSION);
  // everything else preserved
  assert.equal(up.galleryId, "g");
  assert.equal((up as any).template, "editorial-clean");
  assert.deepEqual((up as any).scenes, [{ id: "a" }]);
  // a plan already at the current version is returned unchanged (same reference)
  assert.equal(upgradeScenePlan(up), up);
});

test("new per-scene v2 fields round-trip through JSON serialization", () => {
  const scene: Scene = {
    id: "s1",
    imageId: "img-1",
    durationSec: 3,
    fit: "fit",
    background: "blur",
    focal: { x: 0.5, y: 0.4 },
    motion: "parallax",
    motionDirection: "left",
    motionIntensity: "medium",
    transitionIn: "masked-reveal",
    transitionDurationSec: 0.6,
    transitionOut: "match-cut",
    transitionOutDurationSec: 0.3,
    captionStyle: "bold",
    role: "peak",
    locked: true,
    beatAlignedSec: 12.5,
    text: { content: "Hi", position: "bottom" },
  };
  const round = JSON.parse(JSON.stringify(scene)) as Scene;
  assert.deepEqual(round, scene);
  assert.equal(round.locked, true);
  assert.equal(round.transitionOut, "match-cut");
  assert.equal(round.captionStyle, "bold");
  assert.equal(round.role, "peak");
  assert.equal(round.beatAlignedSec, 12.5);
});

test("collage cells are tenant-isolated: a foreign collage image id is rejected", () => {
  const mk = (over: Partial<Scene>): Scene => ({
    id: "s", imageId: "img-a", durationSec: 3, fit: "fill", background: "none",
    focal: { x: 0.5, y: 0.4 }, motion: "push-in", motionDirection: "up",
    motionIntensity: "medium", transitionIn: "cross-dissolve", transitionDurationSec: 0.4, ...over,
  });
  const plan = (scene: Scene) => ({
    version: SCENE_PLAN_VERSION, galleryId: "g", format: "9:16", template: "editorial-clean",
    length: "standard", pace: "balanced", fps: 30, width: 1080, height: 1920,
    opening: { kind: "opening", enabled: false, showLogo: false, durationSec: 0 },
    outro: { kind: "outro", enabled: false, showLogo: false, durationSec: 0 },
    scenes: [mk({ id: "a", imageId: "img-a" }), mk({ id: "b", imageId: "img-b" }), scene],
    brand: { accentHex: "#000", headingFont: "x", bodyFont: "y" }, generatedBy: "manual",
  } as unknown as ScenePlan);
  const allowed = new Set(["img-a", "img-b", "img-c"]);
  // a collage of owned images passes
  const ok = validateScenePlan(plan(mk({ id: "c", imageId: "img-a", layout: "collage", collageImageIds: ["img-a", "img-b", "img-c"] })), allowed);
  assert.ok(ok.ok, ok.errors.join("; "));
  // a collage that smuggles a FOREIGN id is rejected
  const bad = validateScenePlan(plan(mk({ id: "c", imageId: "img-a", layout: "collage", collageImageIds: ["img-a", "img-XXX"] })), allowed);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /foreign imageId img-XXX/.test(e)), bad.errors.join("; "));
  // a collage with the wrong cell count is rejected
  const wrongCount = validateScenePlan(plan(mk({ id: "c", imageId: "img-a", layout: "collage", collageImageIds: ["img-a"] })), allowed);
  assert.equal(wrongCount.ok, false);
});

test("applyBeatSync snaps unlocked cuts toward beats and preserves locked scenes", () => {
  const mkScene = (id: string, dur: number, locked = false): Scene => ({
    id, imageId: id, durationSec: dur, fit: "fill", background: "none",
    focal: { x: 0.5, y: 0.4 }, motion: "push-in", motionDirection: "up",
    motionIntensity: "medium", transitionIn: "cross-dissolve", transitionDurationSec: 0.4, locked,
  });
  const plan = {
    version: SCENE_PLAN_VERSION, galleryId: "g", format: "9:16", template: "editorial-clean",
    length: "standard", pace: "balanced", fps: 30, width: 1080, height: 1920,
    opening: { kind: "opening", enabled: false, showLogo: false, durationSec: 0 },
    outro: { kind: "outro", enabled: false, showLogo: false, durationSec: 0 },
    scenes: [mkScene("a", 2.9), mkScene("b", 3.2, true), mkScene("c", 2.7)],
    brand: { accentHex: "#000", headingFont: "x", bodyFont: "y" },
    audio: { trackId: "warm", durationSec: 32, beatsSec: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0], phrasesSec: [] },
    beatSyncStrength: 1,
    generatedBy: "auto",
  } as unknown as ScenePlan;

  const out = applyBeatSync(plan);
  // Scene A (2.9s, unlocked, strength 1) snaps its end to beat 3.0 -> dur 3.0.
  assert.ok(Math.abs(out.scenes[0].durationSec - 3.0) < 1e-6, `A dur ${out.scenes[0].durationSec}`);
  // Scene B is LOCKED -> duration unchanged (3.2).
  assert.equal(out.scenes[1].durationSec, 3.2);
  // Cut times recorded on the unlocked scenes.
  assert.equal(out.scenes[0].beatAlignedSec, 3.0);
  // With strength 0 the plan is returned unchanged (same reference).
  const off = { ...plan, beatSyncStrength: 0 } as ScenePlan;
  assert.equal(applyBeatSync(off), off);
});
