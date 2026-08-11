// qa-render-event.mts — LOCAL creative validation from an approved real event.
// Serves the approved photos over localhost (never uploaded), renders the three
// required versions (Locked Order / Suggested Edit / Manually Refined) with
// system Chrome, and extracts a dense frame set per version for review.
//   node --experimental-strip-types scripts/qa-render-event.mts [template]
import { planStory, type PlannerImage } from "../src/lib/storyStudio/planner.ts";
import { computeTotalDuration, applyBeatSync, MIN_SCENE_SEC, MAX_SCENE_SEC, type ScenePlan, type AudioAnalysis } from "../src/lib/storyStudio/sceneplan.ts";
import MUSIC_ANALYSIS from "../src/lib/storyStudio/musicAnalysis.json" with { type: "json" };
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const SRC = "/tmp/qa-event-src";
const SERVE = "/tmp/qa-event-serve"; // downscaled to ~preview size (matches prod web_preview, avoids software-render black frames)
const OUT = "/tmp/qa-event";
const FR = "/tmp/qa-event-review";
mkdirSync(OUT, { recursive: true });
mkdirSync(FR, { recursive: true });
mkdirSync(SERVE, { recursive: true });
const TEMPLATE = (process.argv[2] as any) || "editorial-clean";
const PORT = 8799;

const BRAND = {
  accentHex: "#A67C52",
  headingFont: "Playfair Display, Georgia, serif",
  bodyFont: "Inter, sans-serif",
  studioName: "Guy Sidi Photography",
  logoUrl: null,
  // A posted social story carries the studio brand on the title + outro cards, not
  // a proof-style persistent watermark (which also landed starkly on the dark
  // letterbox matte). Off for the deliverable; it stays a per-user toggle in-app.
  watermark: { enabled: false, opacityPercent: 9, position: "bottom-right" },
};
const EVENT = { title: "IAC · Teens Track", date: "17 Jan 2026 · Closing", location: "IAC" };

// ── inventory (filename order = photographer sequence) ────────────────────────
const files = readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
function dims(f: string): { w: number; h: number } {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path.join(SRC, f)], { encoding: "utf8" });
  const w = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return { w, h };
}
// Real face boxes from scripts/detect-faces.py (OpenCV Haar). Same shape the
// production Rekognition pipeline feeds the planner — not invented data.
type FaceRec = { faces: Array<{ x: number; y: number; w: number; h: number }>; faceCount: number; maxFaceArea: number; sharpness: number; brightness: number; warmth: number };
const FACES: Record<string, FaceRec> = (() => {
  try { return JSON.parse(readFileSync("/tmp/qa-event-faces.json", "utf8")); } catch { return {}; }
})();
const images: PlannerImage[] = files.map((f, i) => {
  const { w, h } = dims(f);
  const r = FACES[f];
  const faceBoxes = r?.faces?.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) ?? null;
  return {
    id: `img-${String(i).padStart(2, "0")}`, src: `http://localhost:${PORT}/${f}`, width: w, height: h,
    sortOrder: i, isTopPick: /-hero/i.test(f), faceBoxes,
    faceCount: r?.faceCount ?? null, maxFaceArea: r?.maxFaceArea ?? null,
    sharpness: r?.sharpness ?? null, brightness: r?.brightness ?? null, warmth: r?.warmth ?? null,
  };
});
const fileById = new Map(images.map((im, i) => [im.id, files[i]]));

// ── downscale to preview size (long edge 1280) — matches prod web previews and
// removes the software-render texture pressure that caused intermittent black
// frames on 2048px originals. Never re-uploaded; local /tmp only. ─────────────
await Promise.all(files.map((f) => sharp(path.join(SRC, f)).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(path.join(SERVE, f))));

// ── local static server (localhost only, never uploaded) ──────────────────────
const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").slice(1));
  try { const buf = readFileSync(path.join(SERVE, name)); res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(PORT, r));

const serveUrl = await bundle({ entryPoint: path.resolve("stories-remotion/src/Root.tsx"), publicDir: path.resolve("story-studio-remotion/public") });

// ── Perceptual-hash de-dup (real pixels, deterministic) ───────────────────────
// dHash: scale each photo to 9x8 grayscale, compare adjacent pixels per row ->
// 64-bit fingerprint. Near-identical shots (small Hamming distance) are the two
// "same group" pairs the reviewers flagged; drop the later twin. This mirrors
// what a photographer does in the selection screen before generating.
async function dhash(file: string): Promise<bigint> {
  const raw = await sharp(path.join(SRC, file)).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer(); // 72 bytes
  let h = 0n, bit = 0n;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { if (raw[r * 9 + c] > raw[r * 9 + c + 1]) h |= (1n << bit); bit++; }
  return h;
}
function hamming(a: bigint, b: bigint): number { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; }
async function dedupe(imgs: PlannerImage[]): Promise<PlannerImage[]> {
  const hashes = await Promise.all(imgs.map((im) => dhash(fileById.get(im.id)!)));
  const kept: PlannerImage[] = [];
  const keptHashes: bigint[] = [];
  imgs.forEach((im, i) => {
    if (keptHashes.some((h) => hamming(h, hashes[i]) <= 12)) return; // near-dup of a kept frame
    kept.push(im); keptHashes.push(hashes[i]);
  });
  return kept;
}

// ── Manually-refined edit (the polished deliverable) ──────────────────────────
// A photographer's hand cut using Story Studio controls. The raw gallery is
// wide-heavy (four near-identical ballroom circle shots), so the editor CUTS to
// the six strongest distinct beats, opens on FACES (big group), keeps ONE seated
// establishing wide + ONE energetic activity wide (both letterboxed so the room
// reads), spotlights the cinematic speaker portrait, and closes on the hero
// sunset-window group. Per-photo fit/focal/motion/duration — exactly the choices
// a pro makes in the editor. Keyed by filename (the human's judgement).
type Edit = { file: string; fit: "fit" | "fill"; fy: number; fx?: number; motion: "push-in" | "pull-out" | "pan"; dir?: "left" | "right" | "up" | "down"; intensity: "subtle" | "medium" | "strong"; dur: number };
// The two letterboxed wides (0, 9) are separated by the standing group (5) so the
// middle never sags on two dark mattes in a row. Motion is diversified (push/pull/
// pan) so no move repeats more than twice. The title card gets its OWN backdrop
// (8.jpg, an otherwise-cut wide) so the opening isn't the same photo as beat one.
const MANUAL_EDIT: Edit[] = [
  { file: "2.jpg", fit: "fill", fy: 0.40, fx: 0.46, motion: "push-in", intensity: "strong", dur: 3.0 }, // hook: big group, faces — signature push, focal left to hold the edge face
  { file: "0.jpg", fit: "fit", fy: 0.5, motion: "pull-out", intensity: "strong", dur: 3.2 }, // establishing seated circle (letterboxed) — clearer travel
  { file: "5.jpg", fit: "fill", fy: 0.46, motion: "pull-out", intensity: "medium", dur: 2.4 }, // standing group — a shorter punch beat for rhythm contrast
  { file: "9.jpg", fit: "fit", fy: 0.5, motion: "push-in", intensity: "strong", dur: 3.0 }, // energetic activity circle (letterboxed) — clearer travel
  { file: "6.jpg", fit: "fill", fy: 0.32, fx: 0.52, motion: "push-in", intensity: "medium", dur: 3.4 }, // cinematic speaker portrait
  { file: "1.jpg", fit: "fill", fy: 0.34, motion: "pull-out", intensity: "medium", dur: 3.8 }, // hero sunset-window group close
];
const TITLE_COVER_FILE = "8.jpg"; // unique title backdrop, not reused as a beat
function buildManual(dedup: PlannerImage[]): ScenePlan {
  const byFile = new Map(dedup.map((im) => [fileById.get(im.id)!, im]));
  const ordered = MANUAL_EDIT.map((e) => byFile.get(e.file)).filter(Boolean).map((im, i) => ({ ...(im as PlannerImage), sortOrder: i }));
  const base = planStory(ordered, { galleryId: opts.galleryId, template: TEMPLATE, brand: BRAND, event: EVENT, preserveOrder: true });
  const scenes = base.scenes.map((s) => {
    const e = MANUAL_EDIT.find((x) => x.file === fileById.get(s.imageId))!;
    return {
      ...s,
      fit: e.fit,
      background: (e.fit === "fit" ? "blur" : "none") as "blur" | "none",
      focal: { x: e.fx ?? 0.5, y: e.fy },
      motion: e.motion,
      motionDirection: e.dir,
      motionIntensity: e.intensity as any,
      durationSec: Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, e.dur)),
    };
  });
  const titleCover = images.find((im) => fileById.get(im.id) === TITLE_COVER_FILE)?.src;
  return {
    ...base, scenes,
    opening: { ...base.opening, enabled: true, title: EVENT.title, subtitle: EVENT.date, durationSec: 2.4, coverSrc: titleCover } as any,
    outro: { ...base.outro, enabled: true, title: BRAND.studioName, durationSec: 2.4 },
    // Bundled, license-clean "warm" (cinematic) track — the actual posted-story
    // experience has music; a soft fade in/out sits it under the visuals.
    music: { trackId: "warm", volume: 0.72, fadeInSec: 1.5, fadeOutSec: 2.5, muted: false },
    generatedBy: "manual",
  };
}

async function render(label: string, plan: ScenePlan) {
  const srcOf = (id: string) => images.find((im) => im.id === id)?.src;
  const withSrc = { ...plan, scenes: plan.scenes.map((s) => ({ ...s, src: srcOf(s.imageId), collageSrc: s.collageImageIds?.map(srcOf).filter(Boolean) })) };
  const comp = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan: withSrc }, browserExecutable: CHROME });
  const mp4 = path.join(OUT, `${label}.mp4`);
  const hasMusic = !!plan.music && !plan.music.muted && !!plan.music.trackId && (plan.music.volume ?? 0) > 0;
  await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: mp4, inputProps: { plan: withSrc }, muted: !hasMusic, browserExecutable: CHROME, concurrency: 2 });
  // plan summary + dense frames (~1 per scene)
  const dur = computeTotalDuration(withSrc);
  writeFileSync(path.join(FR, `${label}.plan.json`), JSON.stringify({ version: label, template: withSrc.template, totalSec: dur, scenes: withSrc.scenes.length, order: withSrc.scenes.map((s) => fileById.get(s.imageId)), sceneList: withSrc.scenes.map((s, i) => ({ i, file: fileById.get(s.imageId), dur: s.durationSec, motion: s.motion, intensity: s.motionIntensity, transition: s.transitionIn, fit: s.fit, focal: s.focal })) }, null, 2));
  const marks: Array<[string, number]> = [];
  let cursor = withSrc.opening.enabled ? withSrc.opening.durationSec : 0;
  if (withSrc.opening.enabled) marks.push(["opening", withSrc.opening.durationSec * 0.7]);
  for (let i = 0; i < withSrc.scenes.length; i++) { marks.push([`sc${String(i).padStart(2, "0")}`, cursor + withSrc.scenes[i].durationSec * 0.5]); cursor += withSrc.scenes[i].durationSec; }
  if (withSrc.outro.enabled) marks.push(["outro", cursor + withSrc.outro.durationSec * 0.6]);
  for (const [n, t] of marks) execFileSync(FFMPEG, ["-y", "-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-update", "1", "-vf", "scale=360:640", "-q:v", "3", path.join(FR, `${label}__${n}.jpg`)], { env: ENV, stdio: ["ignore", "ignore", "ignore"] });
  const sizeMB = (statSync(mp4).size / 1e6).toFixed(1);
  console.log(`${label.padEnd(10)} ${withSrc.template} ${withSrc.scenes.length} scenes ${dur.toFixed(1)}s ${sizeMB}MB ${marks.length} frames`);
}

const opts = { galleryId: "00000000-0000-0000-0000-000000000000", template: TEMPLATE, brand: BRAND, event: EVENT } as const;
const unique = await dedupe(images);
console.log(`De-dup: ${images.length} -> ${unique.length} unique (dropped ${images.filter((im) => !unique.includes(im)).map((im) => fileById.get(im.id)).join(", ") || "none"})`);
// Attach the chosen bundled track's real beat analysis + license and align cuts
// to the beat (beatSyncStrength). Preview == export by construction.
function withMusic(plan: ScenePlan, trackId: "calm" | "warm" | "upbeat", strength: number): ScenePlan {
  const analysis = (MUSIC_ANALYSIS as Record<string, AudioAnalysis>)[trackId] ?? null;
  const withAudio: ScenePlan = {
    ...plan,
    music: { trackId, volume: 0.72, fadeInSec: 1.5, fadeOutSec: 2.5, muted: false, license: "Bundled, synthesized in-repo (scripts/generate-story-audio.mjs); no third-party license." },
    audio: analysis,
    beatSyncStrength: strength,
  };
  return applyBeatSync(withAudio);
}
const locked = planStory(unique, { ...opts, preserveOrder: true });
const suggested = withMusic(planStory(unique, { ...opts, preserveOrder: false }), "warm", 0.5);
const manual = withMusic(buildManual(unique), "warm", 0.45);
await render("locked", locked);
await render("suggested", suggested);
await render("manual", manual);
server.close();
console.log(`\nInventory: ${images.length} photos (${images.filter((i) => i.width! > i.height!).length} landscape / ${images.filter((i) => i.width! <= i.height!).length} portrait). Template: ${TEMPLATE}. MP4s -> ${OUT}, frames -> ${FR}`);
