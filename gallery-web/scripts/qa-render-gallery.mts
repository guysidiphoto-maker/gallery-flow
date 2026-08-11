// qa-render-gallery.mts — GENERAL local Track B harness for an arbitrary approved
// event folder. Read-only on the source: it downscales copies into /tmp and
// serves them over localhost (never uploads/renames/moves/deletes originals).
// Renders the fully-automatic story + the three template variants, letting the
// PLANNER select + sequence from the whole event via real signals.
//   node --experimental-strip-types scripts/qa-render-gallery.mts "<srcDir>" <outTag>
import { planStory, recommendTemplate, type PlannerImage } from "../src/lib/storyStudio/planner.ts";
import { computeTotalDuration, applyBeatSync, type ScenePlan, type AudioAnalysis, type StoryTemplate } from "../src/lib/storyStudio/sceneplan.ts";
import MUSIC_ANALYSIS from "../src/lib/storyStudio/musicAnalysis.json" with { type: "json" };
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const TAG = process.argv[3] || "trackb";
if (!SRC) { console.error("usage: qa-render-gallery.mts <srcDir> <tag>"); process.exit(1); }
const FACES_JSON = `/tmp/${TAG}-faces.json`;
const SERVE = `/tmp/${TAG}-serve`;
const OUT = `/tmp/${TAG}-out`;
const FR = `/tmp/${TAG}-review`;
for (const d of [SERVE, OUT, FR]) mkdirSync(d, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const PORT = 8801;

const BRAND = {
  accentHex: "#C9A227", headingFont: "Playfair Display, Georgia, serif", bodyFont: "Inter, sans-serif",
  studioName: "Guy Sidi Photography", logoUrl: null,
  watermark: { enabled: false, opacityPercent: 9, position: "bottom-right" },
};
const EVENT = { title: "Live Performance", date: "", location: "" };

type FaceRec = { faces: Array<{ x: number; y: number; w: number; h: number }>; faceCount: number; maxFaceArea: number; sharpness: number; brightness: number; warmth: number };
const FACES: Record<string, FaceRec> = (() => { try { return JSON.parse(readFileSync(FACES_JSON, "utf8")); } catch { return {}; } })();

const files = readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
function dims(f: string): { w: number; h: number } {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path.join(SRC, f)], { encoding: "utf8" });
  return { w: Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]), h: Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]) };
}
// story-score proxy from REAL signals (sharpness + face-presence) — stands in for
// the production AI story_score so the planner can SELECT the strongest frames.
const images: PlannerImage[] = files.map((f, i) => {
  const { w, h } = dims(f);
  const r = FACES[f];
  const faceBoxes = r?.faces?.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) ?? null;
  const sharp01 = r?.sharpness ?? 0.5;
  const facePresence = Math.min(1, (r?.faceCount ?? 0) / 8);
  const storyScore = Math.round((sharp01 * 5 + facePresence * 5) * 10) / 10; // 0..10
  return {
    id: `img-${String(i).padStart(3, "0")}`, src: `http://localhost:${PORT}/${encodeURIComponent(f)}`, width: w, height: h,
    sortOrder: i, faceBoxes, faceCount: r?.faceCount ?? null, maxFaceArea: r?.maxFaceArea ?? null,
    sharpness: r?.sharpness ?? null, brightness: r?.brightness ?? null, warmth: r?.warmth ?? null, storyScore,
  };
});
const fileById = new Map(images.map((im, i) => [im.id, files[i]]));

// downscale (long edge 1280) — read-only on source; matches prod previews + avoids
// software-render black frames on full-res originals.
await Promise.all(files.map((f) => sharp(path.join(SRC, f)).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(path.join(SERVE, f))));
const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").slice(1));
  try { res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(readFileSync(path.join(SERVE, name))); } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(PORT, r));
const serveUrl = await bundle({ entryPoint: path.resolve("stories-remotion/src/Root.tsx"), publicDir: path.resolve("story-studio-remotion/public") });

// dHash de-dup
async function dhash(f: string): Promise<bigint> {
  const raw = await sharp(path.join(SERVE, f)).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  let h = 0n, bit = 0n;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { if (raw[r * 9 + c] > raw[r * 9 + c + 1]) h |= (1n << bit); bit++; }
  return h;
}
function ham(a: bigint, b: bigint) { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; }
async function dedupe(imgs: PlannerImage[]): Promise<PlannerImage[]> {
  const hs = await Promise.all(imgs.map((im) => dhash(fileById.get(im.id)!)));
  const kept: PlannerImage[] = [], kh: bigint[] = [];
  imgs.forEach((im, i) => { if (kh.some((h) => ham(h, hs[i]) <= 10)) return; kept.push(im); kh.push(hs[i]); });
  return kept;
}

function withMusic(plan: ScenePlan, trackId: "calm" | "warm" | "upbeat", strength: number): ScenePlan {
  const analysis = (MUSIC_ANALYSIS as Record<string, AudioAnalysis>)[trackId] ?? null;
  return applyBeatSync({ ...plan, music: { trackId, volume: 0.72, fadeInSec: 1.5, fadeOutSec: 2.5, muted: false, license: "Bundled, synthesized in-repo (scripts/generate-story-audio.mjs); no third-party license." }, audio: analysis, beatSyncStrength: strength });
}

async function render(label: string, plan: ScenePlan) {
  const srcOf = (id: string) => images.find((im) => im.id === id)?.src;
  const withSrc = { ...plan, scenes: plan.scenes.map((s) => ({ ...s, src: srcOf(s.imageId), collageSrc: s.collageImageIds?.map(srcOf).filter(Boolean) })) };
  const comp = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan: withSrc }, browserExecutable: CHROME });
  const mp4 = path.join(OUT, `${label}.mp4`);
  const hasMusic = !!plan.music && !plan.music.muted;
  await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: mp4, inputProps: { plan: withSrc }, muted: !hasMusic, browserExecutable: CHROME, concurrency: 2 });
  const dur = computeTotalDuration(withSrc);
  writeFileSync(path.join(FR, `${label}.plan.json`), JSON.stringify({ version: label, template: withSrc.template, totalSec: dur, scenes: withSrc.scenes.length, order: withSrc.scenes.map((s) => fileById.get(s.imageId)), sceneList: withSrc.scenes.map((s, i) => ({ i, file: fileById.get(s.imageId), dur: s.durationSec, motion: s.motion, intensity: s.motionIntensity, transition: s.transitionIn, fit: s.fit, role: s.role, focal: s.focal })) }, null, 2));
  const marks: Array<[string, number]> = [];
  let cur = withSrc.opening.enabled ? withSrc.opening.durationSec : 0;
  if (withSrc.opening.enabled) marks.push(["opening", withSrc.opening.durationSec * 0.7]);
  for (let i = 0; i < withSrc.scenes.length; i++) { marks.push([`sc${String(i).padStart(2, "0")}`, cur + withSrc.scenes[i].durationSec * 0.5]); cur += withSrc.scenes[i].durationSec; }
  if (withSrc.outro.enabled) marks.push(["outro", cur + withSrc.outro.durationSec * 0.6]);
  for (const [n, t] of marks) execFileSync(FFMPEG, ["-y", "-i", mp4, "-ss", t.toFixed(2), "-frames:v", "1", "-update", "1", "-vf", "scale=360:640", "-q:v", "3", path.join(FR, `${label}__${n}.jpg`)], { env: ENV, stdio: ["ignore", "ignore", "ignore"] });
  console.log(`${label.padEnd(18)} ${withSrc.template.padEnd(16)} ${withSrc.scenes.length} scenes ${dur.toFixed(1)}s ${(statSync(mp4).size / 1e6).toFixed(1)}MB`);
}

const unique = await dedupe(images);
console.log(`De-dup: ${images.length} -> ${unique.length} unique`);
const opts = (template: StoryTemplate) => ({ galleryId: "00000000-0000-0000-0000-000000000000", template, brand: BRAND, event: EVENT, preserveOrder: false as const });
// AUTO default = the template the engine RECOMMENDS from the event's energy.
const autoTemplate = recommendTemplate(unique);
console.log(`Recommended auto template: ${autoTemplate}`);
const auto = withMusic(planStory(unique, { ...opts(autoTemplate), pace: autoTemplate === "editorial-clean" ? undefined : ("energetic" as const) }), autoTemplate === "editorial-clean" ? "warm" : "warm", autoTemplate === "editorial-clean" ? 0.5 : 0.55);
const editorial = withMusic(planStory(unique, opts("editorial-clean")), "warm", 0.5);
const cinematic = withMusic(planStory(unique, { ...opts("cinematic-energy"), pace: "energetic" as const }), "warm", 0.55);
const fast = withMusic(planStory(unique, { ...opts("fast-highlights"), pace: "energetic" as const }), "upbeat", 0.7);
await render("AUTO", auto);
await render("VARIANT-editorial", editorial);
await render("VARIANT-cinematic", cinematic);
await render("VARIANT-fast", fast);
server.close();
console.log(`\n${files.length} photos (${images.filter((i) => i.width! > i.height!).length}L/${images.filter((i) => i.width! <= i.height!).length}P). MP4s -> ${OUT}, frames -> ${FR}`);
