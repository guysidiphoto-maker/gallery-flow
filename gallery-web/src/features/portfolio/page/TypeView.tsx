import { EVENT_LABELS, readStr, type GalleryRow, type ImageRow } from './lib'

/** All galleries of one event type, as full-width cover panels. */
export function TypeView({ typeKey, galleries, covers, topPicks, reveal, onOpen }: {
  typeKey: string
  galleries: GalleryRow[]
  covers: Map<string, string>
  topPicks: ImageRow[]
  reveal: (el: HTMLElement | null) => void
  onOpen: (galleryId: string) => void
}) {
  return (
    <div className="animate-[pp-view-fade-in_.7s_cubic-bezier(.16,1,.3,1)_both] pt-[120px] pb-20">
      <div className="mb-[60px] px-6 text-center">
        <div className="mb-3 text-[10px] tracking-[.3em] text-white/35 uppercase">{galleries.length} Projects</div>
        <h2 className="text-[clamp(28px,4vw,52px)] font-normal tracking-[.04em]">{EVENT_LABELS[typeKey] || typeKey}</h2>
      </div>

      <div className="mx-auto max-w-[1200px] px-6">
        {galleries.map((g, i) => {
          const cover = covers.get(g.id)
          const pickCount = topPicks.filter(p => p.gallery_id === g.id).length
          return (
            <div
              key={g.id}
              ref={reveal}
              data-delay={i * 100}
              className="pf-panel relative mb-1 h-[clamp(300px,50vw,500px)]"
              onClick={() => onOpen(g.id)}
            >
              {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />}
              <div className="pf-overlay absolute inset-0 bg-black/45" />
              <div className="absolute inset-x-10 bottom-10 flex items-end justify-between">
                <div>
                  <h3 className="text-[clamp(20px,3vw,36px)] font-normal tracking-[.03em]">{g.name}</h3>
                  <div className="mt-2 text-[10px] tracking-[.25em] text-white/40 uppercase">{readStr(g.delivery_settings, 'eventLocation')}</div>
                </div>
                <div className="text-[10px] tracking-[.2em] text-white/35 uppercase">{pickCount} Photos</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
