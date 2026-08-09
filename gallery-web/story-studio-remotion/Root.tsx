// Root.tsx — registers the Story Studio composition. Duration/size are derived
// from the ScenePlan itself via calculateMetadata, so the timeline length always
// matches the plan (no hand-kept constant to drift).

import React from "react";
import { Composition } from "remotion";
import { StoryStudioVideo } from "./StoryStudioVideo";
import { totalFrames, type ScenePlan } from "../src/lib/storyStudio/sceneplan";

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

// Exported so the shared stories bundle (stories-remotion/src/Root.tsx) can
// register this composition alongside Clean — one bundle, both compositions,
// selectable by id from the render endpoint.
export const StoryStudioComposition: React.FC = () => {
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

export const RemotionRoot: React.FC = () => <StoryStudioComposition />;
