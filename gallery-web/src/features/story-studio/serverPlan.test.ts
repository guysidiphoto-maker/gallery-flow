// serverPlan.test.ts — node --test --experimental-strip-types
// Proves the server security boundary: tenant isolation, src re-resolution,
// dimension authority, gallery-id pinning, injection rejection.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveAndValidatePlan, stripForPersistence, type OwnerImage } from "./serverPlan.ts";
import { planStory, type PlannerImage } from "./planner.ts";
import type { ScenePlan } from "./sceneplan.ts";

const BRAND = { accentHex: "#B45309", headingFont: "Fraunces", bodyFont: "Inter", studioName: "Guy Sidi" };

function ownerImages(n: number): OwnerImage[] {
  return Array.from({ length: n }, (_, i) => ({ id: `img-${i}-abcdef`, width: 1200, height: 1800 }));
}
function plannerImages(n: number): PlannerImage[] {
  return Array.from({ length: n }, (_, i) => ({ id: `img-${i}-abcdef`, width: 1200, height: 1800, sortOrder: i, isTopPick: i % 4 === 0 }));
}
function buildPlan(n = 16, galleryId = "gal-1"): ScenePlan {
  return planStory(plannerImages(n), { galleryId, brand: BRAND, template: "editorial-clean", length: "standard", seed: 7 });
}
const resolver = (id: string) => `https://cdn.example.test/${id}.jpg`;

test("accepts a valid plan and resolves src server-side", () => {
  const plan = buildPlan();
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.ok(res.ok, res.errors.join("; "));
  assert.ok(res.plan!.scenes.every((s) => s.src === `https://cdn.example.test/${s.imageId}.jpg`));
});

test("SECURITY: rejects a plan referencing a foreign image id", () => {
  const plan = buildPlan();
  plan.scenes[3].imageId = "img-from-another-gallery";
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /foreign imageId/.test(e)));
});

test("SECURITY: pins to the authorized gallery (rejects mismatched galleryId)", () => {
  const plan = buildPlan(16, "attacker-gallery");
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /does not match authorized gallery/.test(e)));
});

test("SECURITY: discards client-supplied src (never trusts it)", () => {
  const plan = buildPlan();
  plan.scenes[0].src = "https://evil.example/tracking.gif";
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.ok(res.ok);
  assert.equal(res.plan!.scenes[0].src, `https://cdn.example.test/${plan.scenes[0].imageId}.jpg`);
});

test("SECURITY: dimensions come from server records, not the client", () => {
  const plan = buildPlan();
  plan.scenes[0].width = 99999; // tampered
  plan.scenes[0].height = 1;
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.ok(res.ok);
  assert.equal(res.plan!.scenes[0].width, 1200);
  assert.equal(res.plan!.scenes[0].height, 1800);
});

test("SECURITY: rejects markup-injection in captions", () => {
  const plan = buildPlan();
  plan.scenes[1].text = { content: "<script>alert(1)</script>", position: "bottom" };
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.equal(res.ok, false);
});

test("stripForPersistence removes volatile src + _reason", () => {
  const plan = buildPlan();
  const persisted = stripForPersistence(plan);
  assert.ok(persisted.scenes.every((s) => s.src === undefined && s._reason === undefined));
});

test("SECURITY: drops a non-http brand logo so it can't crash the renderer", () => {
  // A local filesystem path (editor data bug) must never reach the renderer.
  const plan = buildPlan();
  plan.brand = { ...plan.brand, logoUrl: "/Users/guy/Desktop/logo.png" };
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.ok(res.ok, res.errors.join("; "));
  assert.equal(res.plan!.brand.logoUrl, null);
});

test("keeps a valid http(s) brand logo untouched", () => {
  const plan = buildPlan();
  const good = "https://cdn.example.test/logo-primary.png";
  plan.brand = { ...plan.brand, logoUrl: good };
  const res = resolveAndValidatePlan(plan, "gal-1", ownerImages(16), resolver);
  assert.ok(res.ok, res.errors.join("; "));
  assert.equal(res.plan!.brand.logoUrl, good);
});
