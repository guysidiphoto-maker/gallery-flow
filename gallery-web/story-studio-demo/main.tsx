// Standalone demo mount for browser QA of the Story Studio editor.
// Synthetic images only (SVG data-URIs) — no customer data.
import React from "react";
import { createRoot } from "react-dom/client";
import { StoryStudioEditor } from "../src/lib/storyStudio/StoryStudioEditor";
import type { PlannerImage } from "../src/lib/storyStudio/planner";
import type { ScenePlan } from "../src/lib/storyStudio/sceneplan";

// Canvas-generated PNG data-URIs. (Remotion's <Img> rejects SVG data-URIs via
// its decode() gate; production uses raster storage URLs, so PNG mirrors that.)
function svg(i: number, w: number, h: number, hue: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue},58%,44%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360},52%,24%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 ${Math.round(w / 3.5)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(i + 1), w / 2, h / 2);
  return c.toDataURL("image/png");
}

const images: PlannerImage[] = Array.from({ length: 24 }, (_, i) => {
  const landscape = i % 3 === 0;
  const w = landscape ? 1800 : 1200;
  const h = landscape ? 1200 : 1800;
  return {
    id: `demo-${String(i).padStart(4, "0")}-abcdef`,
    src: svg(i, w, h, (i * 41) % 360),
    width: w,
    height: h,
    sortOrder: i,
    isTopPick: [3, 9, 15, 21].includes(i),
    storyScore: [3, 9, 15, 21].includes(i) ? 9 : 4 + (i % 3),
    focalX: 0.5,
    focalY: landscape ? 0.5 : 0.4,
  };
});

const brand = {
  accentHex: "#B45309",
  headingFont: "Georgia",
  bodyFont: "Helvetica",
  studioName: "Guy Sidi Photography",
  logoUrl: (() => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 120;
    const x = c.getContext("2d")!;
    x.strokeStyle = "#B45309";
    x.lineWidth = 4;
    x.strokeRect(6, 6, 348, 108);
    x.fillStyle = "#fff";
    x.font = "40px Georgia";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("Guy Sidi", 180, 62);
    return c.toDataURL("image/png");
  })(),
  watermark: { enabled: true, opacityPercent: 20, position: "bottom-right" },
};

const onSave = (plan: ScenePlan) => {
  // In production this POSTs to an owner-authenticated endpoint. Here we just log.
  (window as unknown as { __lastPlan?: ScenePlan }).__lastPlan = plan;
  console.log("[demo] autosaved plan:", plan.scenes.length, "scenes");
};

// NOTE: no React.StrictMode — it double-invokes render and orphans Remotion
// <Player> delayRender handles (black preview). The real app must mount the
// editor outside StrictMode (or gate the Player) for the same reason.
createRoot(document.getElementById("root")!).render(
  <StoryStudioEditor
    images={images}
    brand={brand}
    event={{ title: "Dana & Tom", date: "20 Jun 2026", location: "Caesarea" }}
    galleryId="demo-gallery"
    onSave={onSave}
  />
);
