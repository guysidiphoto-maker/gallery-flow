// Photographer-facing Story Studio editor (Hebrew RTL). The preview renders the
// same composition the renderer encodes, so what you see is what you export.

import { cn } from "@/shared/ui";
import type { PlannerImage } from "./planner";
import type { BrandResolved, ScenePlan } from "./sceneplan";
import { GlobalBar } from "./editor/GlobalBar";
import { PreviewPane } from "./editor/PreviewPane";
import { SceneInspector } from "./editor/SceneInspector";
import { SceneTimeline } from "./editor/SceneTimeline";
import { StorySettings } from "./editor/StorySettings";
import { gridDisplay, panel } from "./editor/studioClasses";
import { usePreviewPlayer } from "./editor/usePreviewPlayer";
import { useStoryPlan } from "./editor/useStoryPlan";

export interface StoryStudioEditorProps {
  images: PlannerImage[];
  brand: BrandResolved;
  event?: { title?: string; date?: string; location?: string };
  /** Called (debounced) whenever the plan changes. Persist the plan here. */
  onSave?: (plan: ScenePlan) => Promise<void> | void;
  /** Called synchronously on every change (incl. the initial auto cut) so the host can render without waiting on save. */
  onPlanChange?: (plan: ScenePlan) => void;
  galleryId: string;
  /** Restore a previously saved draft instead of generating a fresh auto cut. */
  initialPlan?: ScenePlan | null;
  /** Photos to include, in the photographer's order; `images` still holds the full gallery for the add-photo picker. */
  selectedIds?: string[] | null;
}

export function StoryStudioEditor(props: StoryStudioEditorProps) {
  const studio = useStoryPlan(props);
  const { plan } = studio;
  const player = usePreviewPlayer(plan.width, plan.fps);
  const { isNarrow } = player;

  return (
    <div
      dir="rtl"
      ref={player.rootRef}
      className={cn(
        "h-screen gap-px bg-studio font-studio text-studio-text",
        isNarrow ? "flex flex-col overflow-y-auto" : [gridDisplay, "grid-cols-[minmax(280px,340px)_1fr] grid-rows-[auto_1fr_auto]"],
      )}
    >
      <GlobalBar studio={studio} />

      <aside className={cn(panel, "overflow-y-auto", isNarrow ? "order-3 w-full" : "order-0")}>
        <StorySettings plan={plan} brand={props.brand} onPatchCard={studio.patchCard} onSetMusic={studio.setMusic} onSetBeatSync={studio.setBeatSync} />
        <SceneInspector scene={studio.selected} onPatch={studio.patchScene} onReset={studio.resetScene} onToggleCollage={studio.toggleCollage} />
      </aside>

      <PreviewPane plan={plan} player={player} />

      <SceneTimeline studio={studio} isNarrow={isNarrow} />
    </div>
  );
}
