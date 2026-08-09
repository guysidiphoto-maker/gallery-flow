// StoryStudioVideo.tsx — Remotion composition that renders a canonical ScenePlan.
// This is the render half of the "one plan drives preview AND export" guarantee:
// the same ScenePlan object the editor previews is what this composition encodes.
//
// Self-contained (only react + remotion + the shared contract). Motion, fit/crop,
// transitions, brand title cards and watermark are all derived from plan fields.

import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type {
  Scene,
  ScenePlan,
  TitleCard,
  BrandResolved,
} from "../src/lib/storyStudio/sceneplan";

const isHebrew = (s?: string | null) => !!s && /[֐-׿]/.test(s);

// Ease in-out for tasteful motion.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function focalPercent(focal: { x: number; y: number }) {
  return `${(focal.x * 100).toFixed(1)}% ${(focal.y * 100).toFixed(1)}%`;
}

// ── One image scene: fit + focal crop + motion ──────────────────────────────
const SceneLayer: React.FC<{ scene: Scene; durationFrames: number }> = ({
  scene,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const p = easeInOut(interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  const intensity =
    scene.motionIntensity === "strong" ? 0.14 : scene.motionIntensity === "medium" ? 0.09 : 0.05;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  switch (scene.motion) {
    case "push-in":
      scale = 1 + intensity * p;
      break;
    case "pull-out":
      scale = 1 + intensity * (1 - p);
      break;
    case "focus-zoom":
      scale = 1 + (intensity + 0.03) * p;
      break;
    case "pan": {
      const amt = intensity * 100 * p; // px
      if (scene.motionDirection === "left") tx = -amt;
      else if (scene.motionDirection === "right") tx = amt;
      else if (scene.motionDirection === "up") ty = -amt;
      else ty = amt;
      scale = 1 + 0.06; // slight overscan so pan never reveals an edge
      break;
    }
    case "none":
    default:
      scale = 1.0;
  }

  const objectPosition = focalPercent(scene.focal);
  const transformOrigin = objectPosition;

  if (scene.fit === "fit") {
    // Blurred cover background + contained foreground (never crops a face,
    // never shows black bars).
    return (
      <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
        <Img
          src={scene.src!}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition,
            filter: "blur(38px) brightness(0.6)",
            transform: `scale(1.2)`,
          }}
        />
        <Img
          src={scene.src!}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
            transformOrigin,
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <Img
        src={scene.src!}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
          transformOrigin,
        }}
      />
      {scene.text ? <SceneCaption text={scene.text.content} accent="#ffffff" /> : null}
    </AbsoluteFill>
  );
};

const SceneCaption: React.FC<{ text: string; accent: string }> = ({ text }) => {
  const rtl = isHebrew(text);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 360, // inside IG bottom safe zone (~35%)
        color: "#fff",
        fontSize: 52,
        lineHeight: 1.2,
        fontWeight: 600,
        textAlign: rtl ? "right" : "left",
        direction: rtl ? "rtl" : "ltr",
        textShadow: "0 2px 18px rgba(0,0,0,0.55)",
      }}
    >
      {text}
    </div>
  );
};

// ── Title / outro card ──────────────────────────────────────────────────────
const CardLayer: React.FC<{ card: TitleCard; brand: BrandResolved; durationFrames: number }> = ({
  card,
  brand,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationFrames - 12, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const opacity = Math.min(appear, out);
  const rtlTitle = isHebrew(card.title);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b0b0d",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          width: 220,
          height: 6,
          backgroundColor: brand.accentHex,
          borderRadius: 3,
          marginBottom: 40,
          transform: `scaleX(${interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })})`,
        }}
      />
      {card.showLogo && brand.logoUrl ? (
        <Img src={brand.logoUrl} style={{ maxWidth: 340, maxHeight: 180, marginBottom: 36, objectFit: "contain" }} />
      ) : null}
      {card.title ? (
        <div
          style={{
            color: "#fff",
            fontSize: 78,
            fontWeight: 700,
            fontFamily: `${brand.headingFont}, Georgia, serif`,
            textAlign: "center",
            direction: rtlTitle ? "rtl" : "ltr",
            padding: "0 80px",
          }}
        >
          {card.title}
        </div>
      ) : null}
      {card.subtitle ? (
        <div
          style={{
            color: brand.accentHex,
            fontSize: 40,
            marginTop: 22,
            fontFamily: `${brand.bodyFont}, Helvetica, sans-serif`,
            letterSpacing: 1,
            textAlign: "center",
          }}
        >
          {card.subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Watermark: React.FC<{ brand: BrandResolved }> = ({ brand }) => {
  if (!brand.watermark?.enabled || !brand.studioName) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 40,
        bottom: 60,
        color: "#fff",
        opacity: (brand.watermark.opacityPercent ?? 20) / 100,
        fontSize: 30,
        fontWeight: 600,
        textShadow: "0 1px 8px rgba(0,0,0,0.6)",
        fontFamily: `${brand.bodyFont}, sans-serif`,
      }}
    >
      {brand.studioName}
    </div>
  );
};

// ── Top-level video ─────────────────────────────────────────────────────────
export const StoryStudioVideo: React.FC<{ plan: ScenePlan }> = ({ plan }) => {
  const { fps } = useVideoConfig();
  const secToFrames = (s: number) => Math.max(1, Math.round(s * fps));

  let cursor = 0;
  const blocks: React.ReactNode[] = [];

  if (plan.opening?.enabled) {
    const d = secToFrames(plan.opening.durationSec);
    blocks.push(
      <Sequence key="opening" from={cursor} durationInFrames={d}>
        <CardLayer card={plan.opening} brand={plan.brand} durationFrames={d} />
      </Sequence>
    );
    cursor += d;
  }

  plan.scenes.forEach((scene, i) => {
    const d = secToFrames(scene.durationSec);
    const tin = secToFrames(scene.transitionDurationSec);
    // Overlap the incoming scene onto the previous one for the transition.
    const from = i === 0 ? cursor : cursor - tin;
    blocks.push(
      <Sequence key={scene.id} from={Math.max(0, from)} durationInFrames={d + (i === 0 ? 0 : tin)}>
        <TransitionWrap type={scene.transitionIn} transitionFrames={i === 0 ? 0 : tin}>
          <SceneLayer scene={scene} durationFrames={d + (i === 0 ? 0 : tin)} />
        </TransitionWrap>
      </Sequence>
    );
    cursor = from + d + (i === 0 ? 0 : tin);
  });

  if (plan.outro?.enabled) {
    const d = secToFrames(plan.outro.durationSec);
    blocks.push(
      <Sequence key="outro" from={cursor} durationInFrames={d}>
        <CardLayer card={plan.outro} brand={plan.brand} durationFrames={d} />
      </Sequence>
    );
    cursor += d;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {blocks}
      <Watermark brand={plan.brand} />
    </AbsoluteFill>
  );
};

// Applies the entering transition over its first `transitionFrames`.
const TransitionWrap: React.FC<{
  type: string;
  transitionFrames: number;
  children: React.ReactNode;
}> = ({ type, transitionFrames, children }) => {
  const frame = useCurrentFrame();
  if (transitionFrames <= 0 || type === "cut") return <>{children}</>;

  const t = interpolate(frame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let style: React.CSSProperties = { opacity: t };
  if (type === "slide") style = { opacity: 1, transform: `translateX(${(1 - t) * 100}%)` };
  else if (type === "soft-blur") style = { opacity: t, filter: `blur(${(1 - t) * 24}px)` };
  else if (type === "light-leak") style = { opacity: t, filter: `brightness(${1 + (1 - t) * 1.4})` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
