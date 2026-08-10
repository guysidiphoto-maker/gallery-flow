// planner.test.ts — runnable with:  node --test --experimental-strip-types
// Zero external deps (node:test + node:assert). Proves the auto-editing engine
// is deterministic, uses real signals when present, degrades gracefully, and
// that the security validator holds.

import { test } from "node:test";
import assert from "node:assert/strict";

import { planStory, type PlannerImage, type PlannerOptions } from "./planner.ts";
import {
  computeTotalDuration,
  orientationOf,
  validateScenePlan,
  MIN_SCENE_SEC,
  MAX_SCENE_SEC,
  SCENE_PLAN_VERSION,
  type ScenePlan,
} from "./sceneplan.ts";

const BRAND = {
  accentHex: "#B45309",
  headingFont: "Fraunces",
  bodyFont: "Inter",
  studioName: "Guy Sidi Photography",
  logoUrl: "https://example.test/logo.png",
  watermark: { enabled: true, opacityPercent: 20, position: "bottom-right" },
};

function img(id: string, over: Partial<PlannerImage> = {}): PlannerImage {
  return {
    id,
    width: 1200,
    height: 1800, // portrait by default
    sortOrder: 0,
    isTopPick: false,
    ...over,
  };
}

function gallery(n: number, over: (i: number) => Partial<PlannerImage> = () => ({})): PlannerImage[] {
  return Array.from({ length: n }, (_, i) =>
    img(`img-${String(i).padStart(4, "0")}-abcdef`, { sortOrder: i, ...over(i) })
  );
}

const baseOpts = (over: Partial<PlannerOptions> = {}): PlannerOptions => ({
  galleryId: "gal-123",
  brand: BRAND,
  template: "editorial-clean",
  length: "standard",
  event: { title: "Dana & Tom", date: "12 Aug 2026", location: "Tel Aviv" },
  seed: 7,
  ...over,
});

test("produces a valid plan for a normal gallery", () => {
  const plan = planStory(gallery(24), baseOpts());
  assert.equal(plan.version, SCENE_PLAN_VERSION);
  assert.equal(plan.format, "9:16");
  assert.equal(plan.width, 1080);
  assert.equal(plan.height, 1920);
  const res = validateScenePlan(plan, gallery(24).map((i) => i.id));
  assert.ok(res.ok, `expected valid plan, got: ${res.errors.join("; ")}`);
});

test("is fully deterministic (same input+seed => identical output)", () => {
  const imgs = gallery(30, (i) => ({ isTopPick: i % 5 === 0 }));
  const a = planStory(imgs, baseOpts());
  const b = planStory(imgs, baseOpts());
  assert.deepEqual(a, b);
});

test("respects length budget: short <= 10 scenes, extended more", () => {
  const imgs = gallery(40);
  const shortPlan = planStory(imgs, baseOpts({ length: "short" }));
  const extPlan = planStory(imgs, baseOpts({ length: "extended" }));
  assert.ok(shortPlan.scenes.length <= 10, `short=${shortPlan.scenes.length}`);
  assert.ok(extPlan.scenes.length > shortPlan.scenes.length);
});

test("opens with the strongest image (top pick promoted to scene 0)", () => {
  const imgs = gallery(20);
  imgs[13].isTopPick = true; // a strong frame buried in the middle
  const plan = planStory(imgs, baseOpts());
  assert.equal(plan.scenes[0].imageId, imgs[13].id);
  assert.match(plan.scenes[0]._reason ?? "", /opening/);
});

test("uses AI story score to select strongest when scores present", () => {
  const imgs = gallery(30, (i) => ({ storyScore: i === 21 ? 9.8 : 3 }));
  const plan = planStory(imgs, baseOpts({ length: "short" }));
  // the 9.8 frame must survive the trim AND lead
  assert.equal(plan.scenes[0].imageId, imgs[21].id);
});

test("collapses capture-time bursts to one frame", () => {
  // 5 near-identical portrait frames within 1s, then 10 spread out
  const t0 = "2026-08-01T10:00:00.000Z";
  const burst = Array.from({ length: 5 }, (_, i) =>
    img(`burst-${i}-aaaaaa`, { sortOrder: i, capturedAt: `2026-08-01T10:00:0${i}.000Z` })
  );
  const rest = Array.from({ length: 10 }, (_, i) =>
    img(`rest-${i}-bbbbbb`, {
      sortOrder: 5 + i,
      capturedAt: new Date(Date.parse(t0) + (i + 1) * 60000).toISOString(),
    })
  );
  const plan = planStory([...burst, ...rest], baseOpts({ length: "extended" }));
  const burstCount = plan.scenes.filter((s) => s.imageId.startsWith("burst-")).length;
  assert.equal(burstCount, 1, "burst should collapse to a single scene");
});

test("avoids >2 consecutive same-orientation scenes", () => {
  // alternating-ish mix of portrait and landscape
  const imgs = gallery(24, (i) =>
    i % 2 === 0 ? { width: 1800, height: 1200 } : { width: 1200, height: 1800 }
  );
  const plan = planStory(imgs, baseOpts({ length: "extended" }));
  let run = 1;
  for (let i = 1; i < plan.scenes.length; i++) {
    const prev = orientationOf(plan.scenes[i - 1].width, plan.scenes[i - 1].height);
    const cur = orientationOf(plan.scenes[i].width, plan.scenes[i].height);
    run = cur === prev ? run + 1 : 1;
    assert.ok(run <= 2, `orientation run ${run} at scene ${i}`);
  }
});

test("never repeats the same motion effect on consecutive scenes", () => {
  const plan = planStory(gallery(20), baseOpts({ length: "extended" }));
  for (let i = 1; i < plan.scenes.length; i++) {
    if (plan.scenes[i].motion === "none") continue; // static holds may repeat
    assert.notEqual(
      plan.scenes[i].motion,
      plan.scenes[i - 1].motion,
      `consecutive motion repeat at ${i}`
    );
  }
});

test("focal point priority: AI focal > face box > center", () => {
  const withAi = planStory([img("a-ai-000000", { focalX: 0.2, focalY: 0.8 }), ...gallery(4)], baseOpts());
  const aiScene = withAi.scenes.find((s) => s.imageId === "a-ai-000000")!;
  assert.deepEqual(aiScene.focal, { x: 0.2, y: 0.8 });

  const withFace = planStory(
    [img("b-face-0000", { faceBoxes: [{ x: 0.6, y: 0.1, w: 0.2, h: 0.2 }] }), ...gallery(4)],
    baseOpts()
  );
  const faceScene = withFace.scenes.find((s) => s.imageId === "b-face-0000")!;
  assert.ok(Math.abs(faceScene.focal.x - 0.7) < 1e-6 && Math.abs(faceScene.focal.y - 0.2) < 1e-6);

  const plain = planStory([img("c-plain-000"), ...gallery(4)], baseOpts());
  const plainScene = plain.scenes.find((s) => s.imageId === "c-plain-000")!;
  // No AI/face data on a portrait -> rule-of-thirds default (upper-biased Y),
  // so a center-cropped 9:16 keeps faces instead of amputating heads.
  assert.deepEqual(plainScene.focal, { x: 0.5, y: 0.4 });
});

test("holds static / uses fit when a face sits near a frame edge", () => {
  const edgy = img("edge-face-01", {
    width: 1800,
    height: 1200, // landscape
    faceBoxes: [{ x: 0.02, y: 0.4, w: 0.15, h: 0.2 }], // hard against left edge
  });
  const plan = planStory([edgy, ...gallery(6)], baseOpts());
  const s = plan.scenes.find((x) => x.imageId === "edge-face-01")!;
  assert.equal(s.fit, "fit");
  assert.equal(s.background, "blur");
});

test("degrades gracefully with no dimensions and no scores", () => {
  const imgs = Array.from({ length: 14 }, (_, i) => ({
    id: `bare-${i}-000000`,
    sortOrder: i,
  })) as PlannerImage[];
  const plan = planStory(imgs, baseOpts());
  const res = validateScenePlan(plan, imgs.map((i) => i.id));
  assert.ok(res.ok, res.errors.join("; "));
  // all treated as portrait fill, upper-biased rule-of-thirds focal
  assert.ok(plan.scenes.every((s) => s.focal.x === 0.5 && s.focal.y === 0.4));
});

test("every scene duration stays within clamps", () => {
  for (const length of ["short", "standard", "extended"] as const) {
    const plan = planStory(gallery(40), baseOpts({ length }));
    for (const s of plan.scenes) {
      assert.ok(
        s.durationSec >= MIN_SCENE_SEC - 1e-6 && s.durationSec <= MAX_SCENE_SEC + 1e-6,
        `dur ${s.durationSec} for ${length}`
      );
    }
  }
});

test("total duration lands near the length target", () => {
  const plan = planStory(gallery(30), baseOpts({ length: "standard" }));
  const total = computeTotalDuration(plan);
  // standard targets ~30s; allow generous band because clamps + cards apply
  assert.ok(total >= 18 && total <= 45, `total ${total}s outside band`);
});

test("SECURITY: validator rejects a plan referencing a foreign image id", () => {
  const imgs = gallery(12);
  const plan = planStory(imgs, baseOpts());
  // attacker swaps in an id not in the gallery
  plan.scenes[2].imageId = "foreign-gallery-image-999";
  const res = validateScenePlan(plan, imgs.map((i) => i.id));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /foreign imageId/.test(e)));
});

test("SECURITY: validator rejects markup-injection in text/titles", () => {
  const plan = planStory(gallery(12), baseOpts());
  plan.scenes[1].text = { content: "<img src=x onerror=alert(1)>", position: "bottom" };
  const res = validateScenePlan(plan, gallery(12).map((i) => i.id));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /disallowed characters/.test(e)));
});

test("SECURITY: validator rejects out-of-range durations", () => {
  const plan = planStory(gallery(12), baseOpts());
  plan.scenes[0].durationSec = 99;
  const res = validateScenePlan(plan, gallery(12).map((i) => i.id));
  assert.equal(res.ok, false);
});

test("template changes motion/transition vocabulary", () => {
  const clean = planStory(gallery(16), baseOpts({ template: "editorial-clean" }));
  const fast = planStory(gallery(16), baseOpts({ template: "fast-highlights" }));
  // fast-highlights is quicker: shorter average scene than editorial
  const avg = (p: ScenePlan) => p.scenes.reduce((s, x) => s + x.durationSec, 0) / p.scenes.length;
  assert.ok(avg(fast) < avg(clean), `fast avg ${avg(fast)} !< clean avg ${avg(clean)}`);
});

test("preserveOrder keeps the photographer's EXACT sequence (locked source of truth)", () => {
  // Distinct sortOrder + orientations so the smart pipeline WOULD reorder.
  const imgs = gallery(12, (i) => ({ width: i % 2 === 0 ? 1800 : 1200, height: i % 2 === 0 ? 1200 : 1800, isTopPick: i === 7 }));
  const locked = planStory(imgs, baseOpts({ preserveOrder: true }));
  // scene imageIds must equal the input order, first-N (no promotion/interleave/dedupe-move).
  const expected = imgs.slice(0, locked.scenes.length).map((i) => i.id);
  assert.deepEqual(locked.scenes.map((s) => s.imageId), expected, "locked order must match input order");

  // The Suggested Edit (default) is allowed to reorder — prove they can differ
  // (the top-pick at index 7 gets promoted toward the opener).
  const suggested = planStory(imgs, baseOpts({ preserveOrder: false }));
  const changed = suggested.scenes.map((s) => s.imageId).join() !== expected.join();
  assert.ok(changed, "suggested edit should be free to re-sequence");
});

test("templates are categorically different (pace + transitions + motion), not reskins", () => {
  const g = gallery(16);
  const clean = planStory(g, baseOpts({ template: "editorial-clean" }));
  const cine = planStory(g, baseOpts({ template: "cinematic-energy" }));
  const fast = planStory(g, baseOpts({ template: "fast-highlights" }));

  // 1. PACE: fast is a clearly shorter clip than editorial (not the same runtime
  //    reskinned). Require a meaningful gap, not a rounding difference.
  const totClean = computeTotalDuration(clean);
  const totFast = computeTotalDuration(fast);
  assert.ok(totFast < totClean * 0.85, `fast ${totFast}s not clearly shorter than clean ${totClean}s`);

  // 2. TRANSITIONS: disjoint feel. Fast is cut-dominated; editorial never cuts.
  const trans = (p: ScenePlan) => p.scenes.slice(1).map((s) => s.transitionIn);
  const fastCuts = trans(fast).filter((t) => t === "cut").length;
  assert.ok(fastCuts >= trans(fast).length * 0.5, "fast-highlights should be cut-dominated");
  assert.ok(!trans(clean).includes("cut"), "editorial-clean should not use hard cuts");
  assert.ok(trans(cine).includes("light-leak"), "cinematic should use light-leak transitions");

  // 3. MOTION: fast uses punch-in (its signature); editorial does not.
  const motions = (p: ScenePlan) => new Set(p.scenes.map((s) => s.motion));
  assert.ok(motions(fast).has("punch-in"), "fast-highlights should use punch-in");
  assert.ok(!motions(clean).has("punch-in"), "editorial-clean should not use punch-in");
  assert.ok(motions(cine).has("pan"), "cinematic should use pans");

  // 4. INTENSITY: editorial subtle vs cinematic/fast strong.
  assert.equal(clean.scenes[1].motionIntensity, "subtle");
  assert.equal(cine.scenes[1].motionIntensity, "strong");
});

test("brand snapshot is carried onto the plan for preview/export parity", () => {
  const plan = planStory(gallery(10), baseOpts());
  assert.equal(plan.brand.accentHex, BRAND.accentHex);
  assert.equal(plan.brand.studioName, BRAND.studioName);
  assert.equal(plan.outro.enabled, true);
});
