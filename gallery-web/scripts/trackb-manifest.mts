// trackb-manifest.mts — serves the Track B concert gallery (downscaled, read-only
// copies in /tmp) + a manifest (images + real signals + the recommended AUTO
// plan) so the ACTUAL Story Studio editor can load it in the browser. Stays up
// until killed. Never touches the source originals.
//   node --experimental-strip-types scripts/trackb-manifest.mts "<srcDir>"
import { planStory, recommendTemplate, type PlannerImage } from "../src/lib/storyStudio/planner.ts";
import { applyBeatSync, type ScenePlan, type AudioAnalysis } from "../src/lib/storyStudio/sceneplan.ts";
import MUSIC_ANALYSIS from "../src/lib/storyStudio/musicAnalysis.json" with { type: "json" };
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const PORT = 8802;
const SERVE = "/tmp/trackb-serve";
const FACES = JSON.parse(readFileSync("/tmp/trackb-faces.json", "utf8")) as Record<string, any>;
const BRAND = { accentHex: "#C9A227", headingFont: "Playfair Display, Georgia, serif", bodyFont: "Inter, sans-serif", studioName: "Guy Sidi Photography", logoUrl: null, watermark: { enabled: false, opacityPercent: 9, position: "bottom-right" } };
const EVENT = { title: "Live · Ivri Lider", date: "17 Jan 2026", location: "IAC" };

const files = readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
function dims(f: string) { const o = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path.join(SRC, f)], { encoding: "utf8" }); return { w: +o.match(/pixelWidth:\s*(\d+)/)![1], h: +o.match(/pixelHeight:\s*(\d+)/)![1] }; }
const images: PlannerImage[] = files.map((f, i) => {
  const { w, h } = dims(f); const r = FACES[f];
  const facePresence = Math.min(1, (r?.faceCount ?? 0) / 8);
  const storyScore = Math.round(((r?.sharpness ?? 0.5) * 5 + facePresence * 5) * 10) / 10;
  return { id: `img-${String(i).padStart(3, "0")}`, src: `http://localhost:${PORT}/${encodeURIComponent(f)}`, width: w, height: h, sortOrder: i, faceBoxes: r?.faces?.map((b: any) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) ?? null, faceCount: r?.faceCount ?? null, maxFaceArea: r?.maxFaceArea ?? null, sharpness: r?.sharpness ?? null, brightness: r?.brightness ?? null, warmth: r?.warmth ?? null, storyScore };
});
// dedupe (dHash) so the editor pool matches what the auto planner selected from.
async function dhash(f: string) { const raw = await sharp(path.join(SERVE, f)).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer(); let h = 0n, bit = 0n; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { if (raw[r * 9 + c] > raw[r * 9 + c + 1]) h |= (1n << bit); bit++; } return h; }
const fileById = new Map(images.map((im, i) => [im.id, files[i]]));
const hs = await Promise.all(images.map((im) => dhash(fileById.get(im.id)!)));
const kept: PlannerImage[] = [], kh: bigint[] = [];
images.forEach((im, i) => { const dup = kh.some((h) => { let x = h ^ hs[i], n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n <= 10; }); if (!dup) { kept.push(im); kh.push(hs[i]); } });

const template = recommendTemplate(kept);
const analysis = (MUSIC_ANALYSIS as Record<string, AudioAnalysis>)["warm"] ?? null;
const auto: ScenePlan = applyBeatSync({ ...planStory(kept, { galleryId: "00000000-0000-0000-0000-000000000000", template, brand: BRAND, event: EVENT, preserveOrder: false, pace: "energetic" }), music: { trackId: "warm", volume: 0.72, fadeInSec: 1.5, fadeOutSec: 2.5, muted: false, license: "Bundled in-repo" }, audio: analysis, beatSyncStrength: 0.55 });

const manifest = { images: kept, plan: auto, brand: BRAND, event: EVENT };
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = decodeURIComponent((req.url || "/").slice(1));
  if (req.method === "POST" && url === "save-refined") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { writeFileSync("/tmp/trackb-refined-plan.json", body); res.writeHead(200); res.end("ok"); console.log(`saved refined plan (${body.length} bytes)`); });
    return;
  }
  if (url === "manifest.json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(manifest)); return; }
  try { res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(readFileSync(path.join(SERVE, url))); } catch { res.writeHead(404); res.end(); }
});
server.listen(PORT, () => console.log(`Track B manifest server on http://localhost:${PORT}/manifest.json  (template=${template}, ${kept.length} photos, ${auto.scenes.length} auto scenes)`));
