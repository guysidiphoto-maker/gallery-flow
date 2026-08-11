import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_PLAN_VERSION,
  upgradeScenePlan,
  MOTION_EFFECTS,
  TRANSITIONS,
  CAPTION_STYLES,
  type Scene,
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
