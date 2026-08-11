// render-plan.mts — render a canonical ScenePlan produced by the ACTUAL editor
// (no in-code/JSON edits). Resolves scene.src from the approved concert folder
// (served read-only via the running manifest server on :8802) and exports the MP4.
//   node --experimental-strip-types scripts/render-plan.mts <planJson> <srcDir> <label>
import { computeTotalDuration, type ScenePlan } from "../src/lib/storyStudio/sceneplan.ts";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const PLAN = process.argv[2], SRC = process.argv[3], LABEL = process.argv[4] || "REFINED";
const OUT = "/tmp/trackb-out", FR = "/tmp/trackb-review", PORT = 8802;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const COMP = path.resolve("node_modules/@remotion/compositor-darwin-arm64");
const FFMPEG = path.join(COMP, "ffmpeg");
const ENV = { ...process.env, DYLD_LIBRARY_PATH: COMP };

const files = readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
const fileByIdx = (id: string) => files[parseInt(id.replace(/\D/g, ""), 10)];
const plan: ScenePlan = JSON.parse(readFileSync(PLAN, "utf8"));
const withSrc: ScenePlan = { ...plan, scenes: plan.scenes.map((s) => ({ ...s, src: `http://localhost:${PORT}/${encodeURIComponent(fileByIdx(s.imageId))}` })) };

const serveUrl = await bundle({ entryPoint: path.resolve("stories-remotion/src/Root.tsx"), publicDir: path.resolve("story-studio-remotion/public") });
const comp = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan: withSrc }, browserExecutable: CHROME });
const mp4 = path.join(OUT, `${LABEL}.mp4`);
const hasMusic = !!plan.music && !plan.music.muted;
await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: mp4, inputProps: { plan: withSrc }, muted: !hasMusic, browserExecutable: CHROME, concurrency: 2 });
const dur = computeTotalDuration(withSrc);
writeFileSync(path.join(FR, `${LABEL}.plan.json`), JSON.stringify({ version: LABEL, template: withSrc.template, totalSec: dur, scenes: withSrc.scenes.length, generatedBy: withSrc.generatedBy, order: withSrc.scenes.map((s) => fileByIdx(s.imageId)), sceneList: withSrc.scenes.map((s, i) => ({ i, file: fileByIdx(s.imageId), dur: s.durationSec, motion: s.motion, transition: s.transitionIn, fit: s.fit, role: s.role, locked: s.locked })) }, null, 2));
let cur = withSrc.opening.enabled ? withSrc.opening.durationSec : 0;
const marks: Array<[string, number]> = [];
if (withSrc.opening.enabled) marks.push(["opening", withSrc.opening.durationSec * 0.7]);
for (let i = 0; i < withSrc.scenes.length; i++) { marks.push([`sc${String(i).padStart(2, "0")}`, cur + withSrc.scenes[i].durationSec * 0.5]); cur += withSrc.scenes[i].durationSec; }
if (withSrc.outro.enabled) marks.push(["outro", cur + withSrc.outro.durationSec * 0.6]);
for (const [n, t] of marks) execFileSync(FFMPEG, ["-y", "-i", mp4, "-ss", t.toFixed(2), "-frames:v", "1", "-update", "1", "-vf", "scale=360:640", "-q:v", "3", path.join(FR, `${LABEL}__${n}.jpg`)], { env: ENV, stdio: ["ignore", "ignore", "ignore"] });
console.log(`${LABEL}: ${withSrc.scenes.length} scenes ${dur.toFixed(1)}s ${(statSync(mp4).size / 1e6).toFixed(1)}MB  generatedBy=${withSrc.generatedBy}`);
