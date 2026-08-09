// story-evidence.mts — render local visual EVIDENCE that the three templates are
// categorically different. Uses stock (picsum) photos, NOT customer data — this
// proves TEMPLATE differentiation (motion/pacing/composition/transitions), which
// is image-agnostic. Run: node --experimental-strip-types scripts/story-evidence.mts
import { planStory, type PlannerImage } from "../src/lib/storyStudio/planner.ts";
import { totalFrames, type ScenePlan, type StoryTemplate } from "../src/lib/storyStudio/sceneplan.ts";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill, renderMedia } from "@remotion/renderer";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.resolve("docs/story-studio/evidence");
const MP4_OUT = "/tmp/story-evidence";
const BRAND = {
  accentHex: "#B45309",
  headingFont: "Playfair Display, Georgia, serif",
  bodyFont: "Inter, sans-serif",
  studioName: "Guy Sidi Photography",
  logoUrl: null,
  watermark: { enabled: true, opacityPercent: 18, position: "bottom-right" },
};

// 16 stock photos, alternating orientation, a couple of top-picks.
function gallery(): PlannerImage[] {
  return Array.from({ length: 16 }, (_, i) => {
    const landscape = i % 2 === 0;
    const w = landscape ? 1800 : 1200;
    const h = landscape ? 1200 : 1800;
    return {
      id: `img-${String(i).padStart(4, "0")}-eeeeee`,
      src: `https://picsum.photos/seed/pixflow-${i}/${w}/${h}`,
      width: w,
      height: h,
      sortOrder: i,
      isTopPick: i === 0 || i === 7 || i === 15,
    } satisfies PlannerImage;
  });
}

function fillSrc(plan: ScenePlan, imgs: PlannerImage[]): ScenePlan {
  const byId = new Map(imgs.map((i) => [i.id, i.src!]));
  return { ...plan, scenes: plan.scenes.map((s) => ({ ...s, src: byId.get(s.imageId) })) };
}

const TEMPLATES: StoryTemplate[] = ["editorial-clean", "cinematic-energy", "fast-highlights"];

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(MP4_OUT, { recursive: true });
  const imgs = gallery();
  const event = { title: "Dana & Tom", date: "20 Jun 2026", location: "Caesarea" };

  console.log("[evidence] bundling composition…");
  const serveUrl = await bundle({ entryPoint: path.resolve("stories-remotion/src/Root.tsx") });

  for (const template of TEMPLATES) {
    const plan = fillSrc(planStory(imgs, { galleryId: "00000000-0000-0000-0000-000000000000", template, brand: BRAND, event }), imgs);
    const tf = totalFrames(plan);
    console.log(`\n[evidence] ${template}: ${plan.scenes.length} scenes, ${tf} frames (${(tf / 30).toFixed(1)}s)`);
    await fs.writeFile(path.join(OUT, `plan-${template}.json`), JSON.stringify(plan, null, 2));

    const comp = await selectComposition({ serveUrl, id: "StoryStudio", inputProps: { plan }, browserExecutable: CHROME });

    // Representative frames: opening card, first body cut, ~1/3, ~1/2 (transition), ~2/3, closing.
    const marks: Array<[string, number]> = [
      ["01-opening", Math.min(tf - 1, 20)],
      ["02-firstcut", Math.min(tf - 1, Math.round(tf * 0.18))],
      ["03-third", Math.round(tf * 0.33)],
      ["04-mid", Math.round(tf * 0.5)],
      ["05-twothirds", Math.round(tf * 0.66)],
      ["06-closing", Math.max(0, tf - 25)],
    ];
    for (const [label, frame] of marks) {
      const out = path.join(OUT, `${template}__${label}.jpg`);
      await renderStill({ composition: comp, serveUrl, output: out, frame: Math.max(0, Math.min(tf - 1, frame)), inputProps: { plan }, imageFormat: "jpeg", jpegQuality: 72, scale: 0.5, browserExecutable: CHROME, overwrite: true });
      console.log(`   still ${label} @f${frame} -> ${path.basename(out)}`);
    }

    // Full MP4 (to /tmp so it doesn't bloat the repo).
    const mp4 = path.join(MP4_OUT, `${template}.mp4`);
    await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: mp4, inputProps: { plan }, videoBitrate: "4500k", browserExecutable: CHROME });
    const stat = await fs.stat(mp4);
    console.log(`   MP4 -> ${mp4} (${(stat.size / 1e6).toFixed(1)} MB)`);
  }
  console.log("\n[evidence] done. Stills in docs/story-studio/evidence/, MP4s in /tmp/story-evidence/");
}
main().catch((e) => { console.error(e); process.exit(1); });
