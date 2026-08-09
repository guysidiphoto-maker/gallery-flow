// Root.tsx — registers the Story Studio composition. Duration/size are derived
// from the ScenePlan itself via calculateMetadata, so the timeline length always
// matches the plan (no hand-kept constant to drift).

import React from "react";
import { Composition } from "remotion";
import { StoryStudioVideo } from "./StoryStudioVideo";
import type { ScenePlan } from "../src/lib/storyStudio/sceneplan";

const FALLBACK: ScenePlan = {
  version: 1,
  galleryId: "preview",
  format: "9:16",
  template: "editorial-clean",
  length: "standard",
  pace: "balanced",
  fps: 30,
  width: 1080,
  height: 1920,
  opening: { kind: "opening", enabled: false, showLogo: false, durationSec: 2 },
  outro: { kind: "outro", enabled: false, showLogo: false, durationSec: 2 },
  scenes: [],
  brand: { accentHex: "#B45309", headingFont: "Georgia", bodyFont: "Helvetica" },
  generatedBy: "auto",
};

function totalFrames(plan: ScenePlan): number {
  const f = (s: number) => Math.max(1, Math.round(s * plan.fps));
  let total = 0;
  if (plan.opening?.enabled) total += f(plan.opening.durationSec);
  for (const s of plan.scenes) total += f(s.durationSec); // transitions overlap, net 0
  if (plan.outro?.enabled) total += f(plan.outro.durationSec);
  return Math.max(1, total);
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="StoryStudio"
      component={StoryStudioVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ plan: FALLBACK }}
      calculateMetadata={({ props }) => {
        const plan = (props as { plan: ScenePlan }).plan;
        return {
          durationInFrames: totalFrames(plan),
          fps: plan.fps,
          width: plan.width,
          height: plan.height,
          props,
        };
      }}
    />
  );
};
