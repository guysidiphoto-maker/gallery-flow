// qa-scan-mp4.mts — objective defect scan + dense contact sheets from the rendered MP4s.
// Samples every 0.5s, measures mean luminance (black/broken-frame detection) and
// frame-to-frame change (repeated/frozen-frame detection), and stitches a vertical
// contact sheet per version so a reviewer can read the whole timeline in one image.
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import sharp from "sharp";
import path from "node:path";

const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg");
const FFPROBE = path.join(COMP, "ffprobe");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const OUT = "/tmp/qa-event";
const SHEET = "/tmp/qa-event-sheets";
mkdirSync(SHEET, { recursive: true });

function probeDur(mp4: string): number {
  const o = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", mp4], { env: ENV, encoding: "utf8" });
  return parseFloat(o.trim());
}

for (const label of ["locked", "suggested", "manual"]) {
  const mp4 = path.join(OUT, `${label}.mp4`);
  const dur = probeDur(mp4);
  const tmp = path.join(SHEET, `_${label}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // sample every 0.5s at thumbnail size (stripped ffmpeg only does single-frame -update)
  const stamps: number[] = [];
  for (let t = 0.2; t < dur; t += 0.5) stamps.push(t);
  stamps.forEach((t, i) => execFileSync(FFMPEG, ["-y", "-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-update", "1", "-vf", "scale=160:284", "-q:v", "4", path.join(tmp, `f${String(i).padStart(3, "0")}.jpg`)], { env: ENV, stdio: ["ignore", "ignore", "ignore"] }));
  const frames = readdirSync(tmp).filter((f) => f.endsWith(".jpg")).sort();
  // luminance + change stats
  let minLuma = 255, blackCount = 0, frozenCount = 0;
  let prev: Buffer | null = null;
  const lumas: number[] = [];
  for (const f of frames) {
    const img = sharp(path.join(tmp, f));
    const { data } = await img.clone().greyscale().resize(32, 32, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    lumas.push(mean);
    if (mean < minLuma) minLuma = mean;
    if (mean < 6) blackCount++;
    if (prev) { let diff = 0; for (let i = 0; i < data.length; i++) diff += Math.abs(data[i] - prev[i]); if (diff / data.length < 0.5) frozenCount++; }
    prev = data;
  }
  // vertical strips of ~14 frames each, side by side -> one sheet
  const cols = Math.ceil(frames.length / 14);
  const rows = Math.min(14, frames.length);
  const cw = 160, ch = 284, gap = 3;
  const composites = frames.map((f, i) => ({ input: path.join(tmp, f), top: (i % rows) * (ch + gap), left: Math.floor(i / rows) * (cw + gap) }));
  const W = cols * (cw + gap), H = rows * (ch + gap);
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 20, g: 20, b: 20 } } }).composite(composites).jpeg({ quality: 78 }).toFile(path.join(SHEET, `${label}.sheet.jpg`));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${label.padEnd(10)} ${dur.toFixed(1)}s  ${frames.length} frames  minLuma=${minLuma.toFixed(1)}  black(<6)=${blackCount}  frozen=${frozenCount}  sheet=${cols}x${rows}`);
}
console.log(`Sheets -> ${SHEET}/{locked,suggested,manual}.sheet.jpg`);
