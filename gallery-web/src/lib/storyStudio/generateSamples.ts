// generateSamples.ts — builds 3 representative sample galleries, runs the auto
// planner, validates each plan, and writes JSON snapshots + readable storyboards.
// Run:  node --experimental-strip-types generateSamples.ts
// Synthetic fixtures only — NO production customer data.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planStory, type PlannerImage, type PlannerOptions } from "./planner.ts";
import {
  computeTotalDuration,
  orientationOf,
  validateScenePlan,
  sanitizeForRender,
  type ScenePlan,
  type StoryTemplate,
} from "./sceneplan.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "samples");
mkdirSync(OUT, { recursive: true });

// Deterministic pseudo-metadata generator (index-based, no randomness).
function makeGallery(
  prefix: string,
  count: number,
  shape: (i: number) => Partial<PlannerImage>
): PlannerImage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${String(i).padStart(4, "0")}-abcdef`,
    sortOrder: i,
    ...shape(i),
  }));
}

// ── Sample 1: Corporate event (mostly landscape, a few strong AI-scored heroes) ─
const corporate = makeGallery("corp", 34, (i) => ({
  width: i % 3 === 0 ? 1200 : 1800,
  height: i % 3 === 0 ? 1800 : 1200,
  isTopPick: [4, 11, 19, 27].includes(i),
  storyScore: [4, 11, 19, 27].includes(i) ? 9.2 : 4 + ((i * 7) % 4),
  heroScore: i === 11 ? 9.6 : 5,
  focalX: 0.5,
  focalY: 0.42,
  capturedAt: new Date(Date.parse("2026-05-10T09:00:00Z") + i * 90_000).toISOString(),
}));

// ── Sample 2: Wedding (portrait-heavy, capture bursts, faces near edges) ────────
const wedding = makeGallery("wed", 42, (i) => {
  const burst = i >= 8 && i <= 12; // a 5-frame burst of the first kiss
  return {
    width: i % 5 === 0 ? 1800 : 1200,
    height: i % 5 === 0 ? 1200 : 1800,
    isTopPick: [2, 10, 21, 33, 40].includes(i),
    faceBoxes:
      i % 4 === 0
        ? [{ x: 0.05, y: 0.3, w: 0.16, h: 0.22 }] // face hard-left (edge case)
        : [{ x: 0.4, y: 0.22, w: 0.2, h: 0.26 }],
    capturedAt: burst
      ? new Date(Date.parse("2026-06-20T17:30:00Z") + (i - 8) * 800).toISOString()
      : new Date(Date.parse("2026-06-20T15:00:00Z") + i * 120_000).toISOString(),
  };
});

// ── Sample 3: Concert (no AI scores at all — pure structural fallback) ──────────
const concert = makeGallery("gig", 28, (i) => ({
  width: i % 2 === 0 ? 1200 : 1800,
  height: i % 2 === 0 ? 1800 : 1200,
  isTopPick: [1, 9, 17, 25].includes(i),
  // NO storyScore / heroScore / focal -> tests the honest degrade path
}));

const brandOf = (studio: string, accent: string) => ({
  accentHex: accent,
  headingFont: "Fraunces",
  bodyFont: "Inter",
  studioName: studio,
  logoUrl: "https://example.test/logo.png",
  watermark: { enabled: true, opacityPercent: 18, position: "bottom-right" },
});

interface Sample {
  key: string;
  label: string;
  images: PlannerImage[];
  opts: PlannerOptions;
}

const samples: Sample[] = [
  {
    key: "corporate",
    label: "Corporate event (landscape-heavy, AI-scored)",
    images: corporate,
    opts: {
      galleryId: "sample-corporate",
      template: "cinematic-energy",
      length: "standard",
      pace: "balanced",
      brand: brandOf("Eclipse Media", "#1E3A8A"),
      event: { title: "Annual Kickoff 2026", date: "10 May 2026", location: "Tel Aviv" },
      seed: 11,
    },
  },
  {
    key: "wedding",
    label: "Wedding (portrait-heavy, bursts, edge faces)",
    images: wedding,
    opts: {
      galleryId: "sample-wedding",
      template: "editorial-clean",
      length: "extended",
      pace: "relaxed",
      brand: brandOf("Guy Sidi Photography", "#B45309"),
      event: { title: "Dana & Tom", date: "20 Jun 2026", location: "Caesarea" },
      seed: 20,
    },
  },
  {
    key: "concert",
    label: "Concert (no AI metadata — structural fallback)",
    images: concert,
    opts: {
      galleryId: "sample-concert",
      template: "fast-highlights",
      length: "short",
      pace: "energetic",
      brand: brandOf("Eclipse Live", "#7C3AED"),
      event: { title: "Neon Nights", date: "02 Aug 2026" },
      seed: 2,
    },
  },
];

function storyboard(label: string, imgs: PlannerImage[], plan: ScenePlan): string {
  const lines: string[] = [];
  lines.push(`# Auto-Story Storyboard — ${label}`);
  lines.push("");
  lines.push(`- Template: **${plan.template}** · Length: **${plan.length}** · Pace: **${plan.pace}**`);
  lines.push(`- Source photos: **${imgs.length}** → Selected scenes: **${plan.scenes.length}**`);
  lines.push(`- Total duration (incl. cards): **${computeTotalDuration(plan)}s**`);
  lines.push(`- Opening card: ${plan.opening.enabled ? `“${plan.opening.title}” — ${plan.opening.subtitle ?? ""}` : "none"}`);
  lines.push(`- Outro card: ${plan.outro.enabled ? `“${plan.outro.title}” (logo:${plan.outro.showLogo})` : "none"}`);
  lines.push("");
  lines.push("| # | image | orient | dur | fit | motion (dir/int) | transition | focal | why |");
  lines.push("|--:|-------|--------|----:|-----|------------------|------------|-------|-----|");
  plan.scenes.forEach((s, i) => {
    const o = orientationOf(s.width, s.height);
    lines.push(
      `| ${i + 1} | ${s.imageId.slice(0, 12)} | ${o} | ${s.durationSec}s | ${s.fit}${s.background !== "none" ? "/" + s.background : ""} | ${s.motion} (${s.motionDirection}/${s.motionIntensity}) | ${s.transitionIn} ${s.transitionDurationSec}s | ${s.focal.x.toFixed(2)},${s.focal.y.toFixed(2)} | ${s._reason ?? ""} |`
    );
  });
  return lines.join("\n") + "\n";
}

const summary: string[] = ["# Story Studio — Auto-Plan Sample Results", "", `Generated deterministically from synthetic fixtures. Regenerate with \`node --experimental-strip-types generateSamples.ts\`.`, ""];

for (const s of samples) {
  const plan = planStory(s.images, s.opts);
  const res = validateScenePlan(plan, s.images.map((i) => i.id));
  const clean = sanitizeForRender(plan);

  writeFileSync(join(OUT, `${s.key}.plan.json`), JSON.stringify(clean, null, 2));
  writeFileSync(join(OUT, `${s.key}.storyboard.md`), storyboard(s.label, s.images, plan));

  const orientCounts = plan.scenes.reduce<Record<string, number>>((acc, sc) => {
    const o = orientationOf(sc.width, sc.height);
    acc[o] = (acc[o] ?? 0) + 1;
    return acc;
  }, {});
  const motionSet = new Set(plan.scenes.map((sc) => sc.motion));
  const staticHolds = plan.scenes.filter((sc) => sc.motion === "none").length;
  const fitBlur = plan.scenes.filter((sc) => sc.fit === "fit").length;

  summary.push(`## ${s.label}`);
  summary.push(`- valid: **${res.ok}** ${res.ok ? "" : "— " + res.errors.join("; ")}`);
  summary.push(`- scenes: ${plan.scenes.length} · duration: ${computeTotalDuration(plan)}s`);
  summary.push(`- orientation mix: ${JSON.stringify(orientCounts)}`);
  summary.push(`- distinct motions used: ${[...motionSet].join(", ")} (static holds: ${staticHolds})`);
  summary.push(`- edge-face safe fits (blurred bg): ${fitBlur}`);
  summary.push(`- opener: ${plan.scenes[0].imageId.slice(0, 12)} — ${plan.scenes[0]._reason}`);
  summary.push("");
  console.log(`✔ ${s.key}: ${plan.scenes.length} scenes, ${computeTotalDuration(plan)}s, valid=${res.ok}`);
}

writeFileSync(join(OUT, "SUMMARY.md"), summary.join("\n"));
console.log(`\nWrote snapshots + storyboards to ${OUT}`);
