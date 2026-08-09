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
  StoryTemplate,
  TitleCard,
  BrandResolved,
} from "../src/lib/storyStudio/sceneplan";

const isHebrew = (s?: string | null) => !!s && /[֐-׿]/.test(s);

// Ease in-out for tasteful (continuous) motion; ease-out for snap-and-settle.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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
    case "punch-in": {
      // Snap-and-settle: starts noticeably enlarged, eases back to rest inside
      // the first ~35% of the scene, then holds. Reads as a percussive hit — the
      // signature move of the fast-highlights template.
      const settle = easeOutCubic(
        interpolate(frame, [0, Math.max(1, durationFrames * 0.35)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      );
      scale = 1 + (intensity + 0.06) * (1 - settle);
      break;
    }
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

  // Caption renders in BOTH fit modes (previously it was dropped on the
  // fit/landscape branch, so a typed caption silently vanished on landscape
  // scenes — a preview==export violation). Position honors text.position.
  const caption = scene.text ? (
    <SceneCaption text={scene.text.content} position={scene.text.position} />
  ) : null;

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
        {caption}
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
      {caption}
    </AbsoluteFill>
  );
};

const SceneCaption: React.FC<{ text: string; position?: "top" | "center" | "bottom" }> = ({
  text,
  position = "bottom",
}) => {
  const rtl = isHebrew(text);
  // Vertical placement honors text.position; bottom stays inside the IG safe zone.
  const vertical: React.CSSProperties =
    position === "top"
      ? { top: 200 }
      : position === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: 360 };
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        ...vertical,
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

// ── Per-template art direction ───────────────────────────────────────────────
// One canonical ScenePlan; three recognizably different visual identities. Each
// card design is distinct within the first frames (title weight/case/alignment,
// accent shape, entrance animation) and each template paints a different overall
// frame treatment (letterbox+vignette / clean / kinetic).
interface CardDesign {
  bg: string;
  titleWeight: number;
  titleSize: number;
  titleTransform: "none" | "uppercase";
  titleLetterSpacing: number;
  subtitleTransform: "none" | "uppercase";
  subtitleLetterSpacing: number;
  align: "center" | "flex-start";
  textAlign: "center" | "left";
  accent: "line" | "wide" | "block";
  // entrance: how the title arrives
  entrance: "fade" | "rise" | "scale";
}
const CARD_DESIGN: Record<StoryTemplate, CardDesign> = {
  "editorial-clean": {
    bg: "#0c0c0e", titleWeight: 500, titleSize: 74, titleTransform: "none", titleLetterSpacing: 1,
    subtitleTransform: "uppercase", subtitleLetterSpacing: 6, align: "center", textAlign: "center",
    accent: "line", entrance: "fade",
  },
  "cinematic-energy": {
    bg: "#050506", titleWeight: 800, titleSize: 96, titleTransform: "uppercase", titleLetterSpacing: 2,
    subtitleTransform: "uppercase", subtitleLetterSpacing: 10, align: "flex-start", textAlign: "left",
    accent: "wide", entrance: "scale",
  },
  "fast-highlights": {
    bg: "#0a0a0c", titleWeight: 900, titleSize: 104, titleTransform: "uppercase", titleLetterSpacing: 0,
    subtitleTransform: "none", subtitleLetterSpacing: 1, align: "flex-start", textAlign: "left",
    accent: "block", entrance: "rise",
  },
};

// ── Title / outro card ──────────────────────────────────────────────────────
const CardLayer: React.FC<{
  card: TitleCard;
  brand: BrandResolved;
  template: StoryTemplate;
  durationFrames: number;
}> = ({ card, brand, template, durationFrames }) => {
  const frame = useCurrentFrame();
  const d = CARD_DESIGN[template];
  const appearFrames = template === "fast-highlights" ? 8 : template === "cinematic-energy" ? 18 : 14;
  const appear = interpolate(frame, [0, appearFrames], [0, 1], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationFrames - 12, durationFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = Math.min(appear, out);
  const rtlTitle = isHebrew(card.title);

  // entrance transform for the title
  let titleTransform = "none";
  if (d.entrance === "rise") titleTransform = `translateY(${(1 - appear) * 40}px)`;
  else if (d.entrance === "scale") titleTransform = `scale(${0.82 + appear * 0.18})`;

  const accentEl =
    d.accent === "block" ? (
      <div style={{ height: 18, width: interpolate(appear, [0, 1], [0, 120]), backgroundColor: brand.accentHex, marginBottom: 20 }} />
    ) : (
      <div
        style={{
          width: d.accent === "wide" ? 320 : 200,
          height: d.accent === "wide" ? 8 : 5,
          backgroundColor: brand.accentHex,
          borderRadius: 3,
          marginBottom: d.align === "center" ? 40 : 26,
          transform: `scaleX(${appear})`,
          transformOrigin: d.textAlign === "left" ? "left" : "center",
        }}
      />
    );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: d.bg,
        alignItems: d.align,
        justifyContent: "center",
        opacity,
        padding: d.align === "flex-start" ? "0 90px" : 0,
      }}
    >
      {template === "cinematic-energy" ? <Vignette /> : null}
      {accentEl}
      {card.showLogo && brand.logoUrl ? (
        <Img src={brand.logoUrl} style={{ maxWidth: 300, maxHeight: 150, marginBottom: 30, objectFit: "contain" }} />
      ) : null}
      {card.title ? (
        <div
          style={{
            color: "#fff",
            fontSize: d.titleSize,
            fontWeight: d.titleWeight,
            fontFamily: `${brand.headingFont}, Georgia, serif`,
            textTransform: d.titleTransform,
            letterSpacing: d.titleLetterSpacing,
            lineHeight: 1.02,
            textAlign: d.textAlign,
            direction: rtlTitle ? "rtl" : "ltr",
            transform: titleTransform,
            padding: d.align === "center" ? "0 80px" : 0,
          }}
        >
          {card.title}
        </div>
      ) : null}
      {card.subtitle ? (
        <div
          style={{
            color: brand.accentHex,
            fontSize: 38,
            marginTop: 22,
            fontFamily: `${brand.bodyFont}, Helvetica, sans-serif`,
            textTransform: d.subtitleTransform,
            letterSpacing: d.subtitleLetterSpacing,
            textAlign: d.textAlign,
            opacity: appear,
          }}
        >
          {card.subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Radial vignette used by the cinematic template (scenes + cards).
const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }}
  />
);

// Per-template overlay painted over the whole video. The treatment is a primary
// way the three templates read as different at a glance:
//   cinematic  -> wide 2.4:1 letterbox bars + heavy vignette (filmic)
//   fast       -> reel-style segmented progress bars (handled at top level)
//   editorial  -> nothing; stays clean full-bleed
const TemplateTreatment: React.FC<{ template: StoryTemplate }> = ({ template }) => {
  if (template === "cinematic-energy") {
    return (
      <>
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.68) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* ~2.4:1 cinematic bars (140px top+bottom on a 1920 frame) */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, background: "#000" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: "#000" }} />
      </>
    );
  }
  return null; // editorial-clean + fast-highlights add nothing here
};

// Reel-style segmented progress bars along the top (Instagram/TikTok Stories
// idiom). Only fast-highlights uses this — an instantly-recognizable social cue
// no other template has. Segments = one bar per block (opening, each scene, outro).
const StoryProgressBars: React.FC<{
  segments: Array<{ from: number; frames: number }>;
  accentHex: string;
}> = ({ segments, accentHex }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 22,
        left: 22,
        right: 22,
        display: "flex",
        gap: 6,
        height: 6,
        zIndex: 5,
      }}
    >
      {segments.map((seg, i) => {
        const fill = interpolate(frame, [seg.from, seg.from + seg.frames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.32)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div style={{ width: `${fill * 100}%`, height: "100%", background: accentHex }} />
          </div>
        );
      })}
    </div>
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
  const segments: Array<{ from: number; frames: number }> = [];

  if (plan.opening?.enabled) {
    const d = secToFrames(plan.opening.durationSec);
    segments.push({ from: cursor, frames: d });
    blocks.push(
      <Sequence key="opening" from={cursor} durationInFrames={d}>
        <CardLayer card={plan.opening} brand={plan.brand} template={plan.template} durationFrames={d} />
      </Sequence>
    );
    cursor += d;
  }

  plan.scenes.forEach((scene, i) => {
    const d = secToFrames(scene.durationSec);
    const tin = secToFrames(scene.transitionDurationSec);
    // Overlap the incoming scene onto the previous one for the transition.
    const from = i === 0 ? cursor : cursor - tin;
    segments.push({ from: Math.max(0, from), frames: d + (i === 0 ? 0 : tin) });
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
    segments.push({ from: cursor, frames: d });
    blocks.push(
      <Sequence key="outro" from={cursor} durationInFrames={d}>
        <CardLayer card={plan.outro} brand={plan.brand} template={plan.template} durationFrames={d} />
      </Sequence>
    );
    cursor += d;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {blocks}
      <TemplateTreatment template={plan.template} />
      {plan.template === "fast-highlights" ? (
        <StoryProgressBars segments={segments} accentHex={plan.brand.accentHex} />
      ) : null}
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
  else if (type === "whip")
    // Fast horizontal motion-blur slide — a reel-style snap between shots.
    style = { opacity: 1, transform: `translateX(${(1 - t) * 65}%)`, filter: `blur(${(1 - t) * 14}px)` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
