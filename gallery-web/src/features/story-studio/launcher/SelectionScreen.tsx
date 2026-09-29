import { useState } from "react";
import { cn } from "@/shared/ui";
import type { PlannerImage } from "../planner";
import { RENDER_MAX_SCENES } from "../sceneplan";
import { ghost, primary } from "./launcherClasses";
import { gridDisplay } from "../editor/studioClasses";

/**
 * Pre-generation photo picker. Defaults to Top Picks (or everything if none are
 * marked) and keeps gallery order; nothing is generated until the photographer confirms.
 */
export function SelectionScreen({ images, onCreate }: { images: PlannerImage[]; onCreate: (ids: string[]) => void }) {
  const hasPicks = images.some((i) => i.isTopPick);
  const [sel, setSel] = useState<Set<string>>(() => new Set((hasPicks ? images.filter((i) => i.isTopPick) : images).map((i) => i.id)));
  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const orderedIds = images.filter((i) => sel.has(i.id)).map((i) => i.id);
  const count = orderedIds.length;
  return (
    <div dir="rtl" className="flex h-full flex-col text-studio-text">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-studio-line px-4 py-3">
        <strong className="text-[15px]">בחרו תמונות לסטורי</strong>
        <span className="text-[13px] text-studio-muted">נבחרו {count} · הסדר שלכם נשמר · עד {RENDER_MAX_SCENES} בהפקה</span>
        <button className={ghost} onClick={() => setSel(new Set(images.map((i) => i.id)))}>בחר הכל</button>
        {hasPicks ? <button className={ghost} onClick={() => setSel(new Set(images.filter((i) => i.isTopPick).map((i) => i.id)))}>רק מומלצות ★</button> : null}
        <div className="flex-1" />
        <button className={cn(primary, count < 3 ? "opacity-50" : "opacity-100")} disabled={count < 3} onClick={() => onCreate(orderedIds)}>צור סטורי ({count}) →</button>
      </div>
      {count > RENDER_MAX_SCENES ? (
        <div className="px-4 py-1.5 text-[12px] text-studio-warn">
          ייכללו {RENDER_MAX_SCENES} התמונות הראשונות בהפקה (אפשר לשנות בעורך).
        </div>
      ) : null}
      <div className={cn(gridDisplay, "flex-1 grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto p-3")}>
        {images.map((img) => {
          const on = sel.has(img.id);
          return (
            <button
              key={img.id}
              onClick={() => toggle(img.id)}
              aria-pressed={on}
              className={cn(
                "relative aspect-[3/4] cursor-pointer overflow-hidden rounded-[8px] border-2 bg-black p-0",
                on ? "border-studio-accent opacity-100" : "border-studio-line opacity-50",
              )}
            >
              {img.src ? <img src={img.src} alt="" className="h-full w-full object-cover" /> : null}
              <span className={cn("absolute start-1 top-1 flex size-[22px] items-center justify-center rounded-full text-[12px] text-white", on ? "bg-studio-accent" : "bg-black/55")}>
                {on ? "✓" : ""}
              </span>
              {img.isTopPick ? <span className="absolute end-1 top-1 text-[13px] text-studio-warn">★</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
