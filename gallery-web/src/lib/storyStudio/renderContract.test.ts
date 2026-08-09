// renderContract.test.ts — guards the renderer RUNTIME + endpoint contract that
// cannot be expressed as ordinary unit tests (the api/ files depend on Supabase +
// Remotion and run outside the project tsconfig). These tests read the actual
// source/config as text/JSON and assert the invariants that, when they drift,
// break the deployed render — the exact class of bug that has bitten this feature
// (guard out of sync with the contract; browserExecutable not passed everywhere).
//
// Run: node --test --experimental-strip-types src/lib/storyStudio/renderContract.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  MOTION_EFFECTS,
  TRANSITIONS,
  MIN_SCENE_SEC,
  MAX_SCENE_SEC,
  RENDER_MAX_SCENES,
  RENDER_MAX_DURATION_SEC,
  computeTotalDuration,
  totalFrames,
  checkRenderFeasibility,
  type ScenePlan,
} from "./sceneplan.ts";
import { planStory, type PlannerImage } from "./planner.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..", "..", ".."); // src/lib/storyStudio -> gallery-web
const read = (rel: string) => readFileSync(path.join(WEB_ROOT, rel), "utf8");
const readJson = (rel: string) => JSON.parse(read(rel));

// ── A. Runtime / package compatibility ───────────────────────────────────────
// @sparticuz/chromium 149 = Chromium major 149, which Chrome-major-matches
// Remotion 4.0.469's tested Chrome (149). Its Node engine floor (^22.17 || >=24)
// requires Node 24 here. If any of these drift, the deployed render regresses to
// the historical exit-127 (missing AL2023 NSS libs) failure.
test("runtime: node pinned to 24.x in-repo (.nvmrc + engines)", () => {
  assert.equal(read(".nvmrc").trim(), "24");
  assert.equal(readJson("package.json").engines?.node, "24.x");
});

test("runtime: @sparticuz/chromium pinned to 149 (declared + locked)", () => {
  const pkg = readJson("package.json");
  const declared = pkg.dependencies?.["@sparticuz/chromium"] ?? "";
  assert.match(declared, /^\^?149\./, `expected ^149.x, got ${declared}`);
  const lock = readJson("package-lock.json");
  const locked = lock.packages?.["node_modules/@sparticuz/chromium"]?.version ?? "";
  assert.match(locked, /^149\./, `lockfile must pin 149.x, got ${locked}`);
});

test("runtime: remotion renderer major matches chromium (both 4.x/149 line)", () => {
  const pkg = readJson("package.json");
  for (const m of ["remotion", "@remotion/renderer", "@remotion/bundler"]) {
    const v = pkg.dependencies?.[m] ?? pkg.devDependencies?.[m] ?? "";
    assert.match(v, /^\^?4\./, `${m} should be 4.x, got ${v}`);
  }
});

test("runtime: vercel function config coherent (memory/timeout/includeFiles)", () => {
  const v = readJson("vercel.json");
  const fn = v.functions?.["api/stories/render.ts"];
  assert.ok(fn, "render function config missing");
  assert.equal(fn.maxDuration, 300);
  assert.equal(fn.memory, 3009);
  assert.match(fn.includeFiles, /@sparticuz\/chromium/);
  assert.match(fn.includeFiles, /@remotion\/compositor-/);
  assert.match(fn.includeFiles, /public\/stories-bundle/);
  // The stale-render sweeper must be scheduled.
  assert.ok(
    (v.crons ?? []).some((c: { path: string }) => c.path === "/api/stories/sweep-stale"),
    "sweep-stale cron not scheduled"
  );
});

// ── B. Server guard is in SYNC with the canonical contract ────────────────────
// The self-contained api/stories/_scenePlanGuard.ts duplicates the contract's
// vocab/limits (it can't import .ts at runtime). Drift here silently rejected
// every fast plan once (1.8s floor, no punch-in/whip). Lock it down.
test("guard: motion + transition vocab in sync with the contract", () => {
  const guard = read("api/stories/_scenePlanGuard.ts");
  for (const m of MOTION_EFFECTS) assert.ok(guard.includes(`'${m}'`), `guard missing motion ${m}`);
  for (const t of TRANSITIONS) assert.ok(guard.includes(`'${t}'`), `guard missing transition ${t}`);
});

test("guard: numeric limits in sync with the contract", () => {
  const guard = read("api/stories/_scenePlanGuard.ts");
  assert.ok(guard.includes(`MIN_SCENE_SEC = ${MIN_SCENE_SEC}`), "guard MIN_SCENE_SEC drift");
  assert.ok(guard.includes(`MAX_SCENE_SEC = ${MAX_SCENE_SEC}`), "guard MAX_SCENE_SEC drift");
  assert.ok(guard.includes(`RENDER_MAX_SCENES = ${RENDER_MAX_SCENES}`), "guard RENDER_MAX_SCENES drift");
  assert.ok(
    guard.includes(`RENDER_MAX_DURATION_SEC = ${RENDER_MAX_DURATION_SEC}`),
    "guard RENDER_MAX_DURATION_SEC drift"
  );
});

// ── C. Executable-path / single-Chromium contract (render.ts source) ──────────
test("render: exactly one Chromium, browserExecutable passed to all 3 launch calls", () => {
  const src = read("api/stories/render.ts");
  // one chromium implementation, no stray puppeteer/playwright
  assert.ok(src.includes("@sparticuz/chromium"), "must use @sparticuz/chromium");
  assert.ok(!/from ['"]puppeteer|from ['"]playwright/.test(src), "no puppeteer/playwright");
  // resolves executablePath once
  assert.ok(src.includes("executablePath"), "must resolve executablePath");
  // every browser-launching call gets the bundled executable
  const launchCalls = ["selectComposition", "renderMedia", "renderStill"];
  for (const c of launchCalls) assert.ok(src.includes(c), `render must call ${c}`);
  const browserExecUses = (src.match(/browserExecutable:/g) ?? []).length;
  assert.ok(browserExecUses >= 3, `browserExecutable must be passed to all launch calls (found ${browserExecUses})`);
});

// ── D. Render-job lifecycle contract (render.ts / cancel.ts source) ────────────
test("lifecycle: stale reap + idempotent completion + cooperative cancel present", () => {
  const src = read("api/stories/render.ts");
  assert.ok(src.includes("STALE_RENDER_MS"), "missing stale-render threshold");
  // completion guard: only promote a row that is still 'rendering'
  assert.ok(src.includes(".eq('status', 'rendering')"), "completion update not guarded");
  // cooperative cancel: drop artifacts if the row is no longer 'rendering'
  assert.ok(/\.remove\(\[.*storagePath/s.test(src), "cancel path must remove uploaded artifacts");
});

test("lifecycle: render_failed 500 does NOT leak raw error text to the client", () => {
  const src = read("api/stories/render.ts");
  // The catch must return a stable code, not the exception message.
  assert.ok(!/error: 'render_failed',\s*message,/.test(src), "render_failed must not return raw message");
});

test("lifecycle: cancel endpoint releases the in-flight lock idempotently", () => {
  const src = read("api/stories/cancel.ts");
  assert.ok(src.includes(".in('status', ['queued', 'rendering'])"), "cancel must scope to active states");
  assert.ok(src.includes("cancelled by user"), "cancel must mark a reason");
});

// ── E. Scene-plan → duration invariants ───────────────────────────────────────
function gallery(n: number): PlannerImage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `img-${String(i).padStart(4, "0")}-abcdef`,
    width: i % 2 === 0 ? 1800 : 1200,
    height: i % 2 === 0 ? 1200 : 1800,
    sortOrder: i,
    isTopPick: i === 0,
  }));
}
const BRAND = { accentHex: "#B45309", headingFont: "Fraunces", bodyFont: "Inter", studioName: "QA", logoUrl: null, watermark: { enabled: true, opacityPercent: 20, position: "bottom-right" } };

test("duration: computeTotalDuration == opening + scenes + outro for every template", () => {
  for (const template of ["editorial-clean", "cinematic-energy", "fast-highlights"] as const) {
    const plan = planStory(gallery(16), { galleryId: "g", template, brand: BRAND, event: { title: "T" } });
    const manual =
      (plan.opening.enabled ? plan.opening.durationSec : 0) +
      plan.scenes.reduce((s, x) => s + x.durationSec, 0) +
      (plan.outro.enabled ? plan.outro.durationSec : 0);
    assert.ok(Math.abs(computeTotalDuration(plan) - manual) < 1e-6, `${template} duration mismatch`);
    // totalFrames must equal the per-part frame sum (fps rounding per part).
    const f = (s: number) => Math.max(1, Math.round(s * plan.fps));
    const framesManual =
      (plan.opening.enabled ? f(plan.opening.durationSec) : 0) +
      plan.scenes.reduce((s, x) => s + f(x.durationSec), 0) +
      (plan.outro.enabled ? f(plan.outro.durationSec) : 0);
    assert.equal(totalFrames(plan), framesManual, `${template} frame count mismatch`);
  }
});

test("duration: auto plans are always render-feasible (within the first-release cap)", () => {
  for (const template of ["editorial-clean", "cinematic-energy", "fast-highlights"] as const) {
    for (const n of [8, 16, 30]) {
      const plan = planStory(gallery(n), { galleryId: "g", template, length: "extended", brand: BRAND });
      assert.ok(plan.scenes.length <= RENDER_MAX_SCENES, `${template}/${n} exceeds scene cap`);
      assert.ok(checkRenderFeasibility(plan).ok, `${template}/${n} not feasible: ${checkRenderFeasibility(plan).reason}`);
    }
  }
});

test("duration: an over-cap plan is rejected by checkRenderFeasibility", () => {
  const plan = planStory(gallery(16), { galleryId: "g", template: "editorial-clean", brand: BRAND });
  // Force it over the scene cap.
  const bloated: ScenePlan = { ...plan, scenes: Array.from({ length: RENDER_MAX_SCENES + 2 }, (_, i) => ({ ...plan.scenes[i % plan.scenes.length], id: `sc_dup_${i}` })) };
  const res = checkRenderFeasibility(bloated);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /limit/i);
});
