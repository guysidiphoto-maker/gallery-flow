// Shared class strings for the dark Story Studio chrome. The editorial shared/ui
// primitives (light, uppercase, hairline) don't match this surface.
const btnBase = "cursor-pointer rounded-[8px] px-3 py-[7px] text-[12px]";

export const btn = `${btnBase} border-none bg-studio-accent text-white`;
export const btnGhost = `${btnBase} border border-studio-line bg-transparent text-studio-text`;
export const mini = "cursor-pointer border-none bg-transparent p-0.5 text-[11px] text-studio-text";
export const lbl = "flex flex-col gap-1.5 text-[13px] text-studio-text";
export const control = "rounded-[8px] border border-studio-line bg-studio px-2 py-[7px] text-[13px] text-studio-text";
export const panel = "border-s border-studio-line bg-studio";
// Stand-in for Tailwind's `grid`: legacy.css still styles `.grid` as the masonry
// gallery (columns, max-width, auto margins), which would leak in here.
export const gridDisplay = "[display:grid]";
