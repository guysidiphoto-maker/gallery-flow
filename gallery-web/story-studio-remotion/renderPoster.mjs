// renderPoster.mjs — render a single still (PNG) from a sample plan for visual QA.
// Usage: node renderPoster.mjs <key> <frame>
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const key = process.argv[2] || "concert";
const frame = Number(process.argv[3] ?? 120);

const plan = JSON.parse(
  readFileSync(path.join(__dirname, "..", "src", "lib", "storyStudio", "samples", `${key}.plan.json`), "utf8")
);
function svgDataUri(i, w, h, focal, hue) {
  const fx = Math.round((focal?.x ?? 0.5) * w), fy = Math.round((focal?.y ?? 0.5) * h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,22%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="${w / 2}" y="${h / 2}" font-family="Arial" font-size="${Math.round(w / 4)}" fill="rgba(255,255,255,0.85)" text-anchor="middle" dominant-baseline="middle" font-weight="700">${i + 1}</text><circle cx="${fx}" cy="${fy}" r="46" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="8"/></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}
plan.brand.logoUrl = "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" rx="14" fill="none" stroke="${plan.brand.accentHex}" stroke-width="4"/><text x="180" y="76" font-family="Georgia" font-size="52" fill="#fff" text-anchor="middle">${plan.brand.studioName}</text></svg>`).toString("base64");
plan.scenes.forEach((s, i) => (s.src = svgDataUri(i, s.width || 1200, s.height || 1800, s.focal, (i * 37) % 360)));

const outDir = path.join(__dirname, "..", "src", "lib", "storyStudio", "samples", "renders");
mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `${key}.poster.png`);
const serveUrl = await bundle({ entryPoint: path.join(__dirname, "index.ts") });
const composition = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan }, browserExecutable: CHROME });
await renderStill({ composition, serveUrl, output, frame, inputProps: { plan }, browserExecutable: CHROME });
console.log(`wrote ${output} (frame ${frame})`);
