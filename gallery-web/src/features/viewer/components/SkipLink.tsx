/** Keyboard-only jump past the hero; #all-images exists for sectioned and flat galleries alike. */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#all-images"
      className="pointer-events-none fixed start-3 top-3 z-[10000] -translate-y-2 rounded-[8px] bg-white px-5 py-2.5 text-[14px] font-bold text-ink no-underline opacity-0 shadow-[0_4px_24px] shadow-black/50 [transition:opacity_.15s,translate_.15s] focus:pointer-events-auto focus:translate-y-0 focus:opacity-100 focus:outline-3 focus:outline-offset-2 focus:outline-brand"
    >
      {label}
    </a>
  )
}
