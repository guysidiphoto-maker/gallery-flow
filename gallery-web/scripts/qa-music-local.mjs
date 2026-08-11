// qa-music-local.mjs — prove Music V1 end to end locally: render one MP4 WITH
// music and one WITHOUT, using the already-built public/stories-bundle (which
// contains the staticFile audio). Then ffprobe both for the audio track +
// loudness. System Chrome; stock picsum images.
import { selectComposition, renderMedia } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFPROBE = path.join(COMP, "ffprobe");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const serveUrl = path.resolve("public/stories-bundle");
const OUT = "/tmp/qa-music";

const brand = { accentHex: "#B45309", headingFont: "Playfair Display, Georgia, serif", bodyFont: "Inter, sans-serif", studioName: "QA", logoUrl: null, watermark: { enabled: true, opacityPercent: 18, position: "bottom-right" } };
function scenes(n) {
  return Array.from({ length: n }, (_, i) => {
    const land = i % 2 === 0;
    return { id: `s${i}`, imageId: `img${i}`, src: `https://picsum.photos/seed/mus${i}/${land ? 1800 : 1200}/${land ? 1200 : 1800}`, width: land ? 1800 : 1200, height: land ? 1200 : 1800, durationSec: 2, fit: "fill", background: "none", focal: { x: 0.5, y: 0.5 }, motion: "push-in", motionDirection: "up", motionIntensity: "subtle", transitionIn: "cross-dissolve", transitionDurationSec: 0.4, text: null };
  });
}
function plan(music) {
  return { version: 1, galleryId: "00000000-0000-0000-0000-000000000000", format: "9:16", template: "editorial-clean", length: "standard", pace: "balanced", fps: 30, width: 1080, height: 1920, opening: { kind: "opening", enabled: true, title: "Music Test", showLogo: false, durationSec: 2 }, outro: { kind: "outro", enabled: true, title: "QA", showLogo: false, durationSec: 2 }, scenes: scenes(6), brand, music, generatedBy: "manual" };
}

async function render(name, p, muted) {
  const comp = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan: p }, browserExecutable: CHROME });
  const out = path.join(OUT, `${name}.mp4`);
  await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: out, inputProps: { plan: p }, muted, browserExecutable: CHROME });
  const acodec = (() => { try { return execFileSync(FFPROBE, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out], { env: ENV, encoding: "utf8" }).trim() || "none"; } catch { return "none"; } })();
  // Mean volume via ffprobe astats (dB); silent ~ -inf/-91dB.
  let meanDb = "n/a";
  try {
    const ffmpeg = path.join(COMP, "ffmpeg");
    const o = execFileSync(ffmpeg, ["-i", out, "-af", "astats=metadata=1:reset=1", "-f", "null", "-"], { env: ENV, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
    const m = o.match(/RMS level dB:\s*(-?[\d.]+|-inf)/);
    if (m) meanDb = m[1];
  } catch (e) { const s = String(e.stderr || ""); const m = s.match(/RMS level dB:\s*(-?[\d.]+|-inf)/); if (m) meanDb = m[1]; }
  console.log(`${name.padEnd(14)} audio=${acodec.padEnd(6)} rms_dB=${meanDb} size=${(statSync(out).size/1e6).toFixed(2)}MB`);
}

import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
await render("with-music", plan({ trackId: "warm", volume: 0.8, fadeInSec: 1, fadeOutSec: 1.5, muted: false }), false);
await render("no-music", plan(null), true);
console.log("done ->", OUT);
