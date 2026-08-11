// renderSample.mjs — render a sample ScenePlan to a real MP4 (proof of the
// plan -> render pipeline). Synthetic SVG placeholders only; NO customer data.
// Usage: node renderSample.mjs <corporate|wedding|concert>
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { readFileSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const key = process.argv[2] || "concert";

const planPath = path.join(__dirname, "..", "src", "lib", "storyStudio", "samples", `${key}.plan.json`);
const plan = JSON.parse(readFileSync(planPath, "utf8"));

// ── synthetic placeholder image per scene (gradient + index + focal marker) ──
function svgDataUri(i, w, h, focal, hue) {
  const fx = Math.round((focal?.x ?? 0.5) * w);
  const fy = Math.round((focal?.y ?? 0.5) * h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},60%,42%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,22%)"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <text x="${w / 2}" y="${h / 2}" font-family="Arial" font-size="${Math.round(w / 4)}"
      fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle" font-weight="700">${i + 1}</text>
    <text x="${w / 2}" y="${h - 60}" font-family="Arial" font-size="40" fill="rgba(255,255,255,0.6)"
      text-anchor="middle">${w}x${h}</text>
    <circle cx="${fx}" cy="${fy}" r="46" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="8"/>
    <circle cx="${fx}" cy="${fy}" r="10" fill="rgba(255,255,255,0.9)"/>
  </svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

const logoSvg =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" rx="14" fill="none" stroke="${plan.brand.accentHex}" stroke-width="4"/><text x="180" y="76" font-family="Georgia" font-size="52" fill="#fff" text-anchor="middle">${plan.brand.studioName || "STUDIO"}</text></svg>`
  ).toString("base64");

plan.brand.logoUrl = logoSvg;
plan.scenes.forEach((s, i) => {
  s.src = svgDataUri(i, s.width || 1200, s.height || 1800, s.focal, (i * 37) % 360);
});

const outDir = path.join(__dirname, "..", "src", "lib", "storyStudio", "samples", "renders");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${key}.mp4`);

const t0 = process.hrtime.bigint();
console.log(`Bundling composition…`);
const serveUrl = await bundle({ entryPoint: path.join(__dirname, "index.ts") });

console.log(`Selecting composition (${plan.scenes.length} scenes)…`);
const composition = await selectComposition({
  serveUrl,
  id: "StoryStudio",
  inputProps: { plan },
  browserExecutable: CHROME,
});

console.log(`Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps → ${outPath}`);
let last = 0;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outPath,
  inputProps: { plan },
  browserExecutable: CHROME,
  concurrency: 2,
  onProgress: ({ progress }) => {
    const pct = Math.round(progress * 100);
    if (pct >= last + 20) {
      last = pct;
      console.log(`  ${pct}%`);
    }
  },
});

const secs = Number(process.hrtime.bigint() - t0) / 1e9;
const sizeMB = statSync(outPath).size / (1024 * 1024);
const durationSec = composition.durationInFrames / composition.fps;
console.log(
  `\n✔ ${key}: ${composition.width}x${composition.height}, ${durationSec.toFixed(1)}s video, ` +
    `${sizeMB.toFixed(2)} MB, rendered in ${secs.toFixed(1)}s (${(secs / durationSec).toFixed(2)}x realtime)`
);
