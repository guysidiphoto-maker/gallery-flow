import { cn } from "@/shared/ui";
import { TEMPLATES, type StoryLength } from "../sceneplan";
import { HE, LENGTH_HE, PACE_HE, TEMPLATE_HE } from "./copy";
import { Segment } from "./Segment";
import { btn, btnGhost } from "./studioClasses";
import type { StoryPlanApi } from "./useStoryPlan";

const SAVE_LABEL = { idle: "", saving: HE.saving, saved: "✓ " + HE.saved, failed: "⚠ " + HE.failed };

/** Top bar: story-wide style controls, regenerate/undo/redo/reset and save status. */
export function GlobalBar({ studio }: { studio: StoryPlanApi }) {
  const { plan, orderMode, saveStatus, setGlobal } = studio;
  return (
    <div className="order-0 col-start-1 col-end-3 flex flex-wrap items-center gap-1 border-b border-studio-line bg-studio-panel px-3.5 py-2">
      <strong className="me-4 text-[18px]">🎬 סטודיו סטורי</strong>
      <Segment label={HE.template} value={plan.template} options={TEMPLATES} labels={TEMPLATE_HE} onChange={(v) => setGlobal({ template: v })} />
      <Segment label={HE.length} value={plan.length} options={["short", "standard", "extended"] as StoryLength[]} labels={LENGTH_HE} onChange={(v) => setGlobal({ length: v })} />
      <Segment label={HE.pace} value={plan.pace} options={["relaxed", "balanced", "energetic"] as const} labels={PACE_HE} onChange={(v) => setGlobal({ pace: v })} />
      <Segment
        label={HE.order}
        value={orderMode}
        options={["locked", "suggested"] as const}
        labels={{ locked: HE.orderLocked, suggested: HE.orderSuggested }}
        onChange={studio.switchOrderMode}
      />
      <div className="flex-1" />
      <button className={btn} onClick={studio.regenerate}>♻︎ {HE.regenerate}</button>
      <button className={btnGhost} onClick={studio.anotherVariation} title="גרסה אוטומטית אחרת (שומר על עריכות ידניות ונעילות)">🎲 גרסה אחרת</button>
      <button className={btnGhost} onClick={studio.undo} disabled={!studio.canUndo}>↩︎ {HE.undo}</button>
      <button className={btnGhost} onClick={studio.redo} disabled={!studio.canRedo}>↪︎ {HE.redo}</button>
      <button className={btnGhost} onClick={studio.resetToAuto}>⟲ {HE.reset}</button>
      <span aria-live="polite" className={cn("min-w-[90px] text-center", saveStatus === "failed" ? "text-studio-error" : "text-studio-muted")}>
        {SAVE_LABEL[saveStatus]}
      </span>
    </div>
  );
}
