import type { MouseEvent } from "react";
import type { Scene } from "../sceneplan";

/** Click-to-set focal point over a 9:16 crop of the scene's photo. */
export function FocalPicker({ src, focal, onChange }: {
  src: string;
  focal: Scene["focal"];
  onChange: (focal: Scene["focal"]) => void;
}) {
  const setFromClick = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ x, y });
  };
  return (
    <div onClick={setFromClick} className="relative mt-1.5 aspect-[9/16] max-h-[200px] cursor-crosshair overflow-hidden rounded-[8px] bg-black">
      <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }} />
      <div
        className="absolute -mt-2.5 -ml-2.5 size-5 rounded-full border-[3px] border-white ring-2 ring-black/50"
        style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
      />
    </div>
  );
}
