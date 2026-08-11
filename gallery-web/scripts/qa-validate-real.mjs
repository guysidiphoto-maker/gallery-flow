// qa-validate-real.mjs — download + ffprobe + extract frames for the realistic
// renders. Render map passed as argv JSON: [[label, "gid/rid.mp4", planned], ...]
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFPROBE = path.join(COMP, "ffprobe");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };
const SB = "https://icxitoczqtcgdkwiaxxc.supabase.co/storage/v1/object/public/gallery-stories";
const OUT = "/tmp/qa-real", FR = "/tmp/qa-real-frames";
mkdirSync(OUT, { recursive: true }); mkdirSync(FR, { recursive: true });
const probe = (f, a) => execFileSync(FFPROBE, a.concat(f), { env: ENV, encoding: "utf8" }).trim();

const JOBS = JSON.parse(process.argv[2]);
for (const [label, rel, planned] of JOBS) {
  const local = path.join(OUT, `${label}.mp4`);
  const buf = Buffer.from(await (await fetch(`${SB}/${rel}`)).arrayBuffer());
  if (buf.length < 10000) { console.log(`${label}: DOWNLOAD FAILED (${buf.length}b)`); continue; }
  writeFileSync(local, buf);
  const [codec, w, h] = probe(local, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "default=noprint_wrappers=1:nokey=1"]).split("\n");
  const dur = parseFloat(probe(local, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1"]));
  let audio = "none"; try { audio = probe(local, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0"]) || "none"; } catch {}
  const ok = w === "1080" && h === "1920" && codec === "h264" && Math.abs(dur - planned) <= 1.2;
  console.log(`${label.padEnd(22)} ${codec} ${w}x${h} dur=${dur.toFixed(2)}s (plan ${planned}) audio=${audio} ${(statSync(local).size/1e6).toFixed(2)}MB ${ok ? "OK" : "CHECK"}`);
  for (const pct of [0.03, 0.2, 0.4, 0.6, 0.8, 0.95]) {
    const t = (dur * pct).toFixed(2);
    execFileSync(FFMPEG, ["-y", "-ss", t, "-i", local, "-frames:v", "1", "-update", "1", "-vf", "scale=405:720", path.join(FR, `${label}__${String(Math.round(pct*100)).padStart(2,"0")}.png`)], { env: ENV, stdio: ["ignore", "ignore", "ignore"] });
  }
}
console.log("frames ->", FR);
