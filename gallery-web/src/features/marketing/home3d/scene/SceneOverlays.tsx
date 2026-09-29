/** Fixed filmic layers above the canvas: olive vignette + cream floor fade, then fine grain. */
export function SceneOverlays() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-(image:--mk-scene-vignette)" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-(image:--mk-film-grain) bg-size-[180px_180px] opacity-5 mix-blend-overlay"
      />
    </>
  )
}
