import { useState } from "react";
import { cn } from "@/shared/ui";
import type { PlannerImage } from "../planner";
import { HE } from "./copy";
import { btnGhost, gridDisplay } from "./studioClasses";

/** Timeline tile that opens a picker of gallery photos not yet in the story. */
export function AddPhotoBar({ available, onAdd }: { available: PlannerImage[]; onAdd: (img: PlannerImage) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-none flex-col items-center justify-start">
      <button
        className={cn(btnGhost, "flex h-[calc(92px*16/9)] w-[92px] flex-col items-center justify-center gap-1 border-dashed")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={HE.addPhoto}
      >
        <span className="text-[24px]">＋</span>
        <span className="text-[11px]">{HE.addPhoto}</span>
      </button>
      {open ? (
        <div className="absolute end-3 bottom-[120px] z-20 max-h-[260px] max-w-[360px] overflow-y-auto rounded-md border border-studio-line bg-studio-panel p-2.5 shadow-studio">
          <div className="mb-2 text-[13px] text-studio-muted">{HE.addPhotoTitle}</div>
          {available.length === 0 ? (
            <div className="text-[12px] text-studio-muted">{HE.noMorePhotos}</div>
          ) : (
            <div className={cn(gridDisplay, "grid-cols-4 gap-1.5")}>
              {available.map((img) => (
                <button
                  key={img.id}
                  onClick={() => { onAdd(img); setOpen(false); }}
                  title={HE.addPhoto}
                  className="aspect-[9/16] cursor-pointer overflow-hidden rounded-sm border border-studio-line bg-black p-0"
                >
                  {img.src ? <img src={img.src} alt="" className="h-full w-full object-cover" /> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
