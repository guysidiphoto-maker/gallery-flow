import { test } from "node:test";
import assert from "node:assert/strict";
import { planStory, type PlannerImage } from "./planner.ts";

// Build a landscape image carrying real-style content signals + face boxes.
function sig(
  id: string,
  over: Partial<PlannerImage> & { faceCount: number; maxFaceArea: number }
): PlannerImage {
  const n = over.faceCount;
  const maxA = over.maxFaceArea;
  const faceBoxes = Array.from({ length: n }, (_, k) => {
    const a = k === 0 ? maxA : 0.0005;
    const w = Math.sqrt(a);
    return { x: 0.4, y: 0.35, w, h: w };
  });
  return {
    id,
    width: 1800,
    height: 1200, // landscape so fit classification applies
    sortOrder: 0,
    faceBoxes,
    warmth: 0,
    sharpness: 1,
    brightness: 0.5,
    ...over,
  };
}

function build() {
  // A realistic mixed set: 2 empty rooms, a huge group (hook), a warm big group
  // (hero closer), a mid group, a small group, and an intimate portrait.
  const imgs: PlannerImage[] = [
    sig("room-a", { faceCount: 1, maxFaceArea: 0.001, sortOrder: 0 }),
    sig("hook-huge", { faceCount: 40, maxFaceArea: 0.003, sortOrder: 1, warmth: 0.005 }),
    sig("mid-group", { faceCount: 9, maxFaceArea: 0.004, sortOrder: 2, warmth: 0.02 }),
    sig("room-b", { faceCount: 2, maxFaceArea: 0.002, sortOrder: 3 }),
    sig("hero-warm", { faceCount: 16, maxFaceArea: 0.004, sortOrder: 4, warmth: 0.05 }),
    sig("portrait", { faceCount: 1, maxFaceArea: 0.02, sortOrder: 5, brightness: 0.28 }),
    sig("small-group", { faceCount: 6, maxFaceArea: 0.003, sortOrder: 6, warmth: 0.01 }),
  ];
  return planStory(imgs, {
    galleryId: "gal-123",
    brand: { accentHex: "#B45309", headingFont: "Fraunces", bodyFont: "Inter", studioName: "Studio" },
    template: "editorial-clean",
    length: "standard",
    seed: 7,
    preserveOrder: false,
  });
}

const MOTION_FAMILY: Record<string, string> = {
  "push-in": "in", "focus-zoom": "in", "punch-in": "in",
  "pull-out": "out", pan: "lat", parallax: "lat", reveal: "rev", none: "still",
};

test("fit classification: rooms letterbox, people/portrait fill", () => {
  const plan = build();
  const byImg = new Map(plan.scenes.map((s) => [s.imageId, s]));
  assert.equal(byImg.get("room-a")!.fit, "fit", "empty room letterboxes");
  assert.equal(byImg.get("room-b")!.fit, "fit", "empty room letterboxes");
  assert.equal(byImg.get("hook-huge")!.fit, "fill", "big group fills");
  assert.equal(byImg.get("portrait")!.fit, "fill", "portrait fills");
});

test("arc: hook is the biggest group; closer is the strongest warm payoff", () => {
  const plan = build();
  assert.equal(plan.scenes[0].imageId, "hook-huge", "opens on the biggest crowd");
  // hero-warm (16 faces, warmth 0.05) must beat small-group and mid-group as the close.
  assert.equal(plan.scenes[plan.scenes.length - 1].imageId, "hero-warm", "closes on the warm hero");
});

test("ending selector prefers the bigger/warmer hero over a generic group", () => {
  const plan = build();
  const closer = plan.scenes[plan.scenes.length - 1].imageId;
  assert.notEqual(closer, "small-group");
  assert.notEqual(closer, "mid-group");
});

test("motion-diversity budget: no two consecutive scenes share a motion family", () => {
  const plan = build();
  for (let i = 1; i < plan.scenes.length; i++) {
    const a = MOTION_FAMILY[plan.scenes[i - 1].motion];
    const b = MOTION_FAMILY[plan.scenes[i].motion];
    // A held portrait ("still") or the pull-out close are allowed next to anything;
    // otherwise consecutive families must differ.
    if (a !== "still" && b !== "still") {
      assert.notEqual(a, b, `scenes ${i - 1}->${i} repeat family ${a} (${plan.scenes[i - 1].motion}/${plan.scenes[i].motion})`);
    }
  }
});

test("portrait (single prominent face) is held still, not panned across", () => {
  const plan = build();
  const portrait = plan.scenes.find((s) => s.imageId === "portrait")!;
  assert.ok(portrait.motion === "none" || portrait.motion === "push-in", `portrait motion ${portrait.motion}`);
  assert.equal(portrait.role, "peak");
});

test("scenes carry an arc role and a lock flag when built from signals", () => {
  const plan = build();
  assert.equal(plan.scenes[0].role, "hook");
  assert.equal(plan.scenes[plan.scenes.length - 1].role, "closer");
  assert.ok(plan.scenes.every((s) => s.locked === false), "auto scenes start unlocked");
});
