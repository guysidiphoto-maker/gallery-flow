// qa-frames-and-plans.mjs — extract a DENSE frame set (~1 per scene) from each
// realistic render + write the scene plan JSON, so creative reviewers can assess
// the whole video (sequence/pacing/crop/motion/typography), not just endpoints.
import { planStory } from "../src/lib/storyStudio/planner.ts";
import { computeTotalDuration } from "../src/lib/storyStudio/sceneplan.ts";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const SB = "https://icxitoczqtcgdkwiaxxc.supabase.co";
const ANON = process.env.QA_ANON;
const FR = "/tmp/qa-review"; mkdirSync(FR, { recursive: true });

const BRAND = { accentHex: "#A67C52", headingFont: "Playfair Display, Georgia, serif", bodyFont: "Inter, sans-serif", studioName: "QA Studio A", logoUrl: null, watermark: { enabled: true, opacityPercent: 18, position: "bottom-right" } };
const PACKS = [
  { label: "wedding-editorial", gid: "dddddddd-0000-0000-0000-000000000001", template: "editorial-clean", event: { title: "Rachel & Daniel", date: "1 Jun 2026 · Tel Aviv" }, mp4: "/tmp/qa-real/wedding-editorial.mp4" },
  { label: "corporate-cinematic", gid: "dddddddd-0000-0000-0000-000000000002", template: "cinematic-energy", event: { title: "TechConf 2026", date: "15 May 2026 · Herzliya" }, mp4: "/tmp/qa-real/corporate-cinematic.mp4" },
  { label: "concert-fast", gid: "dddddddd-0000-0000-0000-000000000003", template: "fast-highlights", event: { title: "Live Nights", date: "20 Jul 2026 · Tel Aviv" }, mp4: "/tmp/qa-real/concert-fast.mp4" },
];

async function images(gid) {
  const r = await fetch(`${SB}/rest/v1/images?gallery_id=eq.${gid}&select=id,width,height,is_top_pick,sort_order&order=sort_order.asc`, { headers: { apikey: ANON } });
  const rows = await r.json();
  return rows.map((x) => ({ id: x.id, width: x.width, height: x.height, isTopPick: x.is_top_pick, sortOrder: x.sort_order }));
}

for (const p of PACKS) {
  const imgs = await images(p.gid);
  const plan = planStory(imgs, { galleryId: p.gid, template: p.template, brand: BRAND, event: p.event });
  const dur = computeTotalDuration(plan);
  // scene plan summary for reviewers
  const summary = { template: plan.template, totalSec: dur, scenes: plan.scenes.length, opening: plan.opening, outro: plan.outro, sceneList: plan.scenes.map((s, i) => ({ i, dur: s.durationSec, motion: s.motion, intensity: s.motionIntensity, transition: s.transitionIn, fit: s.fit, focal: s.focal, orient: (s.width ?? 0) > (s.height ?? 1) ? "landscape" : "portrait" })) };
  writeFileSync(path.join(FR, `${p.label}.plan.json`), JSON.stringify(summary, null, 2));
  // dense frames: opening card + ~1 per scene (sample at each scene midpoint) + outro
  const fps = plan.fps;
  let cursor = plan.opening.enabled ? plan.opening.durationSec : 0;
  const marks = [];
  if (plan.opening.enabled) marks.push(["opening", plan.opening.durationSec * 0.7]);
  for (let i = 0; i < plan.scenes.length; i++) {
    marks.push([`sc${String(i).padStart(2, "0")}`, cursor + plan.scenes[i].durationSec * 0.5]);
    cursor += plan.scenes[i].durationSec;
  }
  if (plan.outro.enabled) marks.push(["outro", cursor + plan.outro.durationSec * 0.6]);
  for (const [name, t] of marks) {
    const out = path.join(FR, `${p.label}__${name}.jpg`);
    try { execFileSync(FFMPEG, ["-y", "-ss", t.toFixed(2), "-i", p.mp4, "-frames:v", "1", "-update", "1", "-vf", "scale=360:640", "-q:v", "3", out], { env: ENV, stdio: ["ignore", "ignore", "ignore"] }); } catch {}
  }
  console.log(`${p.label}: ${marks.length} frames, ${plan.scenes.length} scenes, ${dur.toFixed(1)}s`);
}
console.log("review assets ->", FR);
