import { viewportHeight, type EventType } from './lib'

/** Full-height event-type panels that fade up over the tail of the hero. */
export function EventTypePanels({ types, scrollY, reveal, onOpen }: {
  types: EventType[]
  scrollY: number
  reveal: (el: HTMLElement | null) => void
  onOpen: (typeKey: string) => void
}) {
  const vh = viewportHeight()
  const progress = Math.max(0, Math.min(1, (scrollY - vh * 0.85) / (vh * 0.3)))
  const lift = Math.max(0, (1 - Math.min(1, (scrollY - vh * 0.85) / (vh * 0.3))) * 40)

  return (
    // -100vh overlaps the hero's 200vh stage so no black gap shows.
    <section className="relative z-1 -mt-[100vh]" style={{ opacity: progress, transform: `translateY(${lift}px)` }}>
      {types.length === 1 ? (
        <div className="pf-panel relative h-screen" ref={reveal} onClick={() => onOpen(types[0].key)}>
          {types[0].cover && <img src={types[0].cover} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="pf-overlay absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="mb-3 text-[11px] tracking-[.3em] text-white/50 uppercase">
              {types[0].gals.length} {types[0].gals.length === 1 ? 'Project' : 'Projects'}
            </div>
            <h2 className="text-[clamp(28px,4vw,56px)] font-normal tracking-[.06em]">{types[0].label}</h2>
            {/* Inline opacity/transform win over the hover rule, so this label stays hidden (unchanged behavior). */}
            <div
              className="pf-label mt-5 border-b border-white/30 pb-1 text-[10px] tracking-[.25em] text-white/50 uppercase"
              style={{ opacity: 0, transform: 'translateY(8px)' }}
            >
              See More
            </div>
          </div>
        </div>
      ) : types.length >= 2 ? (
        <div className="flex h-screen gap-0.5">
          {types.map((t, i) => (
            <div
              key={t.key}
              className="pf-panel pf-grid-item relative flex-1"
              ref={reveal}
              onClick={() => onOpen(t.key)}
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {t.cover && <img src={t.cover} alt="" className="absolute inset-0 size-full object-cover" />}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(to_top,rgb(0_0_0/0.7)_0%,rgb(0_0_0/0.25)_50%,transparent_100%)]" />
              <div className="pf-overlay absolute inset-0 bg-black/15" />
              <div className="absolute inset-x-0 bottom-0 px-7 py-8">
                <h2 className="text-[clamp(22px,2.5vw,38px)] leading-[1.2] font-light tracking-[.02em] lowercase">{t.label}</h2>
                <div className="mt-2 text-[10px] tracking-[.2em] text-white/40 uppercase">
                  {t.gals.length} {t.gals.length === 1 ? 'project' : 'projects'}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
