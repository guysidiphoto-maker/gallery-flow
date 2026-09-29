import type { MouseEvent } from "react";
import { cn } from "@/shared/ui";
import type { Scene } from "../sceneplan";
import { HE } from "./copy";
import { mini } from "./studioClasses";

/** One draggable storyboard thumbnail with move/duplicate/remove buttons. */
export function SceneCard({ scene, index, total, selected, first, last, onSelect, onMove, onDuplicate, onRemove, onReorder }: {
  scene: Scene;
  index: number;
  total: number;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
  const objectPosition = `${scene.focal.x * 100}% ${scene.focal.y * 100}%`;
  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={`סצנה ${index + 1} מתוך ${total}. ${HE.reorderHint}`}
      aria-current={selected ? "true" : undefined}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/scene", scene.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/scene");
        if (from) onReorder(from, scene.id);
      }}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={(e) => {
        // Arrow keys follow array order (Left = earlier), not visual direction,
        // so keyboard reorder behaves the same in RTL and LTR.
        if (e.key === "ArrowLeft") { e.preventDefault(); if (!first) onMove(scene.id, -1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); if (!last) onMove(scene.id, 1); }
        else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove(scene.id); }
      }}
      className={cn(
        "w-[92px] flex-none cursor-grab overflow-hidden rounded-[8px] border-2 bg-studio-panel",
        selected ? "border-studio-accent outline-2 outline-studio-accent" : "border-studio-line",
      )}
    >
      <div className="relative aspect-[9/16] bg-black">
        {scene.src ? <img src={scene.src} alt="" className="h-full w-full object-cover" style={{ objectPosition }} /> : null}
        <span className="absolute start-1 top-0.5 text-[11px] text-white text-shadow-studio">{index + 1}</span>
        <span className="absolute start-1 bottom-0.5 text-[9px] text-white text-shadow-studio">{scene.durationSec.toFixed(1)}s</span>
      </div>
      <div className="flex justify-between p-0.5">
        <button title="שמאלה" className={mini} disabled={first} onClick={stop(() => onMove(scene.id, -1))}>◀</button>
        <button title={HE.duplicate} className={mini} onClick={stop(() => onDuplicate(scene.id))}>⧉</button>
        <button title={HE.remove} className={mini} onClick={stop(() => onRemove(scene.id))}>🗑</button>
        <button title="ימינה" className={mini} disabled={last} onClick={stop(() => onMove(scene.id, 1))}>▶</button>
      </div>
    </div>
  );
}
