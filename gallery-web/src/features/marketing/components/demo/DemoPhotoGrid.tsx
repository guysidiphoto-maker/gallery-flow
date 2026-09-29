import { cn } from '@/shared/ui'
import type { DemoState } from './useDemoState'

/** Selectable, reorderable photo grid; also accepts dropped files. */
export function DemoPhotoGrid({ demo }: { demo: DemoState }) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] content-start gap-[5px] m-0 max-w-none px-0 max-md:grid-cols-[repeat(auto-fill,minmax(100px,1fr))] max-[480px]:grid-cols-[repeat(3,1fr)]"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 0) demo.addFiles(e.dataTransfer.files) }}
    >
      {demo.visible.map((p, i) => {
        const isSel = demo.selected.has(p.id)
        return (
          <div
            key={p.id}
            className={cn(
              'relative aspect-[4/3] animate-[mk-lp-ph-in_0.4s_ease_both] cursor-pointer overflow-hidden rounded-[5px] border-2 transition-[border-color] duration-150 ease-[ease] hover:opacity-90',
              isSel ? 'border-brand' : 'border-transparent',
            )}
            onClick={() => demo.toggleSelect(p.id)}
            draggable
            onDragStart={() => demo.setDragId(p.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.stopPropagation(); demo.dropOnPhoto(p.id) }}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <img src={p.url} alt="" loading="lazy" draggable={false} className="pointer-events-none block h-full w-full object-cover" />
            {isSel && (
              <span className="absolute top-1 right-1 flex size-[18px] items-center justify-center rounded-full bg-brand text-[10px] text-white">&#10003;</span>
            )}
            {demo.topPicks.has(p.id) && (
              <span className="absolute top-1 left-1 flex size-5 animate-[mk-lp-star-pop_0.3s_ease] items-center justify-center rounded-full bg-(--mk-gold) text-[11px] text-(--mk-gold-ink)">&#9733;</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
