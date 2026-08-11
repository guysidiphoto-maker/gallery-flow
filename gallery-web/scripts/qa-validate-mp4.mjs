// qa-validate-mp4.mjs — download the 6 deployed MP4s, ffprobe them (dims/codec/
// audio/duration), compare to plan, and extract representative frames. Uses
// Remotion's bundled compositor ffprobe/ffmpeg (no system ffmpeg needed).
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFPROBE = path.join(COMP, "ffprobe");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const SB = "https://icxitoczqtcgdkwiaxxc.supabase.co/storage/v1/object/public/gallery-stories";
const OUT = "/tmp/qa-mp4";
const FRAMES = "/tmp/qa-frames";
mkdirSync(OUT, { recursive: true });
mkdirSync(FRAMES, { recursive: true });

const JOBS = [
  ["wedding-auto", "dddddddd-0000-0000-0000-000000000001/ad289278-4e4a-484e-9a88-f3395f9c5f0d.mp4", 34.49, "editorial"],
  ["wedding-edit", "dddddddd-0000-0000-0000-000000000001/76837d73-b355-4dc5-84b5-74901b3b5d04.mp4", 36.72, "editorial"],
  ["corporate-auto", "dddddddd-0000-0000-0000-000000000002/21e6c1b5-8e31-43b9-8726-2070605057b3.mp4", 29.96, "cinematic"],
  ["corporate-edit", "dddddddd-0000-0000-0000-000000000002/13c4f66f-31e1-471b-b55d-5e574265dc6c.mp4", 32.48, "cinematic"],
  ["concert-auto", "dddddddd-0000-0000-0000-000000000003/b78e3be2-4409-4f5f-b212-5c5803762442.mp4", 23.68, "fast"],
  ["concert-edit", "dddddddd-0000-0000-0000-000000000003/346c2184-254d-4c68-aed6-4bad84f8b089.mp4", 26.64, "fast"],
];

const probe = (f, args) => execFileSync(FFPROBE, args.concat(f), { env: ENV, encoding: "utf8" }).trim();

for (const [key, rel, planned, tmpl] of JOBS) {
  const local = path.join(OUT, `${key}.mp4`);
  const buf = Buffer.from(await (await fetch(`${SB}/${rel}`)).arrayBuffer());
  writeFileSync(local, buf);
  const sizeMB = (statSync(local).size / 1e6).toFixed(2);

  const vid = probe(local, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_packets", "-of", "default=noprint_wrappers=1:nokey=1"]).split("\n");
  const dur = parseFloat(probe(local, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1"]));
  let audio = "none";
  try { audio = probe(local, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0"]) || "none"; } catch {}
  const [codec, w, h] = vid;
  const drift = (dur - planned).toFixed(2);
  const okDims = w === "1080" && h === "1920";
  const okCodec = codec === "h264";
  const okDur = Math.abs(dur - planned) <= 1.0; // within ~1s (frame rounding + cards)

  // extract frames at 0.6s (opening), 25%, 50%, 92%
  const marks = { opening: 0.6, early: +(dur * 0.25).toFixed(2), mid: +(dur * 0.5).toFixed(2), end: +(dur * 0.92).toFixed(2) };
  for (const [label, t] of Object.entries(marks)) {
    const outPng = path.join(FRAMES, `${key}__${label}.png`);
    execFileSync(FFMPEG, ["-y", "-ss", String(t), "-i", local, "-frames:v", "1", "-update", "1", "-vf", "scale=405:720", outPng], { env: ENV, stdio: ["ignore", "ignore", "ignore"] });
  }
  console.log(`${key.padEnd(15)} ${tmpl.padEnd(10)} ${codec} ${w}x${h} dur=${dur.toFixed(2)}s (plan ${planned}, drift ${drift}) audio=${audio} ${sizeMB}MB  [dims:${okDims?"OK":"FAIL"} codec:${okCodec?"OK":"FAIL"} dur:${okDur?"OK":"FAIL"}]`);
}
console.log(`\nframes in ${FRAMES}, mp4s in ${OUT}`);
