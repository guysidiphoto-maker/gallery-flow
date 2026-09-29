import { useMemo } from "react";
import { Player } from "@remotion/player";
import { cn } from "@/shared/ui";
import { StoryStudioVideo } from "../../../../story-studio-remotion/StoryStudioVideo";
import { totalFrames, type ScenePlan } from "../sceneplan";
import { HE } from "./copy";
import { btn, btnGhost, panel } from "./studioClasses";
import type { usePreviewPlayer } from "./usePreviewPlayer";

/**
 * Live preview using the same composition the renderer encodes, so preview = export.
 * Transport controls sit outside the scaled Player so they keep their normal size.
 */
export function PreviewPane({ plan, player }: { plan: ScenePlan; player: ReturnType<typeof usePreviewPlayer> }) {
  const { isNarrow, curFrame, fmt } = player;
  const durationInFrames = useMemo(() => totalFrames(plan), [plan]);
  const totalSec = (durationInFrames / plan.fps).toFixed(1);
  const widthCls = isNarrow ? "w-[min(72vw,340px)]" : "w-[min(300px,44vw)]";

  return (
    <main className={cn(panel, "flex flex-col items-center justify-center", isNarrow ? "order-1 px-0 py-4" : "order-0")}>
      <div className="mb-2 text-[13px] text-studio-muted">
        {HE.total}: {totalSec} {HE.seconds} · {plan.scenes.length} {HE.scene}ות · 9:16
      </div>
      <div ref={player.previewWrapRef} className={cn(widthCls, "aspect-[9/16] overflow-hidden rounded-[12px] bg-black shadow-studio")}>
        {/* `zoom` (not transform) scales at layout level so Remotion's absolutely
            positioned composition stays in-frame. Chrome-only, like the renderer. */}
        <div style={{ zoom: player.scale }}>
          <Player
            ref={player.playerRef}
            component={StoryStudioVideo}
            inputProps={{ plan }}
            durationInFrames={durationInFrames}
            fps={plan.fps}
            compositionWidth={plan.width}
            compositionHeight={plan.height}
            style={{ width: plan.width, height: plan.height }}
            controls={false}
            loop
          />
        </div>
      </div>
      <div className={cn(widthCls, "mt-2.5 flex items-center gap-2.5")}>
        <button className={btnGhost} onClick={() => player.seekTo(0)} title="התחלה">⏮</button>
        <button className={btn} onClick={player.togglePlay}>{player.isPlaying ? "⏸" : "▶"}</button>
        <input
          type="range"
          min={0}
          max={Math.max(1, durationInFrames - 1)}
          value={curFrame}
          onChange={(e) => player.seekTo(Number(e.target.value))}
          className="flex-1"
        />
        <span className="min-w-[74px] text-center text-[12px] text-studio-muted">
          {fmt(curFrame)} / {fmt(durationInFrames)}
        </span>
      </div>
    </main>
  );
}
