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
// ?narrow=1 renders the editor inside a phone-width frame to QA the mobile layout
// (browser-tool window resize can't constrain the CSS viewport here).
// ?narrow=1 renders inside a phone frame; ?w=&h= set an explicit device viewport
// (e.g. iPhone 390x844, Android 412x915, landscape 844x390) for the browser QA
// matrix. ?lang=en swaps the demo event to English text to QA LTR caption/title.
const q = new URLSearchParams(location.search);
const narrow = q.get("narrow") === "1";
const w = q.get("w") ? Number(q.get("w")) : narrow ? 390 : 0;
const h = q.get("h") ? Number(q.get("h")) : narrow ? 800 : 0;
const en = q.get("lang") === "en";
const event = en
  ? { title: "Sarah & James", date: "20 Jun 2026 · Napa Valley", location: "Napa Valley" }
  : { title: "Dana & Tom", date: "20 Jun 2026", location: "Caesarea" };
const editor = (
  <StoryStudioEditor images={images} brand={brand} event={event} galleryId="demo-gallery" onSave={onSave} />
);
createRoot(document.getElementById("root")!).render(
  w && h ? (
    <div style={{ width: w, height: h, margin: "12px auto", border: "8px solid #222", borderRadius: 24, overflow: "hidden" }}>
      {editor}
    </div>
  ) : (
    editor
  )
);
