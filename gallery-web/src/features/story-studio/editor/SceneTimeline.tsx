import { cn } from "@/shared/ui";
import { AddPhotoBar } from "./AddPhotoBar";
import { SceneCard } from "./SceneCard";
import type { StoryPlanApi } from "./useStoryPlan";

/** Horizontal storyboard strip: drag/keyboard reorder plus the add-photo tile. */
export function SceneTimeline({ studio, isNarrow }: { studio: StoryPlanApi; isNarrow: boolean }) {
  const { plan, selectedId } = studio;
  return (
    <div
      role="list"
      aria-label="סצנות הסטורי"
      className={cn(
        "col-start-1 col-end-3 flex gap-2 overflow-x-auto border-t border-studio-line bg-studio-panel p-2.5",
        isNarrow ? "order-2" : "order-0",
      )}
    >
      {plan.scenes.map((s, i) => (
        <SceneCard
          key={s.id}
          scene={s}
          index={i}
          total={plan.scenes.length}
          selected={s.id === selectedId}
          first={i === 0}
          last={i === plan.scenes.length - 1}
          onSelect={() => studio.setSelectedId(s.id)}
          onMove={studio.moveScene}
          onDuplicate={studio.duplicateScene}
          onRemove={studio.removeScene}
          onReorder={studio.reorder}
        />
      ))}
      <AddPhotoBar available={studio.availableImages} onAdd={studio.addPhoto} />
    </div>
  );
}
