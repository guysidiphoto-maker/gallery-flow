import { cn } from '@/shared/ui'
import { chipBtn, primaryBtn, sidebarBtn } from './classes'
import type { DemoCopy } from './copy'
import { IG_LAYOUTS } from './igFeed'
import type { DemoState } from './useDemoState'

/** Instagram profile mock: tap a post to split it across rows, drag to reorder, export. */
export function DemoIgPanel({ t, demo }: { t: DemoCopy; demo: DemoState }) {
  const { photos, igFeed } = demo
  return (
    <div className="p-4 text-center">
      <div className="mb-3 flex items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-full border-2 border-brand/50">
          {photos[0] && <img src={photos[0].url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div>
          <div className="text-[0.9rem] font-bold">your.studio</div>
          <div className="mt-0.5 text-[0.7rem] text-white/40">{igFeed.length} posts &middot; 2.4K followers</div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] text-white/35">{t.igHint}</span>
        <div className="ms-auto flex gap-1">
          {IG_LAYOUTS.map(l => (
            <button key={l.id} className={chipBtn(demo.igLayout === l.id)} onClick={() => demo.setIgLayout(l.id)}>{l.label}</button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-[420px] grid-cols-[repeat(3,1fr)] gap-0.5 px-0">
        {igFeed.map((item, idx) => (
          <div
            key={item.id}
            className={cn('group relative cursor-pointer bg-white/3 active:opacity-60', item.isTile && 'cursor-grab')}
            draggable
            onDragStart={() => demo.setIgDragIdx(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); demo.dropOnFeedItem(idx) }}
            onClick={() => { if (!item.isTile) demo.splitFeedItem(idx) }}
          >
            {/* Padding-bottom square keeps cells perfectly square at any width. */}
            <div className={cn('relative w-full overflow-hidden pb-[100%]', item.isTile && 'outline-2 -outline-offset-2 outline-brand/35')}>
              {item.isTile ? (
                <img
                  src={item.url} alt="" draggable={false}
                  className="absolute block object-cover transition-opacity duration-150 ease-[ease]"
                  style={{
                    width: `${(item.tileCols || 1) * 100}%`,
                    height: `${(item.tileRows || 1) * 100}%`,
                    left: `${-(item.tileCol || 0) * 100}%`,
                    top: `${-(item.tileRow || 0) * 100}%`,
                  }}
                />
              ) : (
                <img
                  src={item.url} alt="" draggable={false}
                  className="absolute top-0 left-0 block h-full w-full object-cover transition-opacity duration-150 ease-[ease] group-hover:opacity-85"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-2">
        <button className={primaryBtn('px-5 py-2 text-[0.8rem]')} onClick={demo.exportAll} disabled={demo.igExporting || igFeed.length === 0}>
          {demo.igExporting ? t.igExporting : t.igExportAll}
        </button>
        <button className={sidebarBtn(false, 'text-[0.8rem]')} onClick={demo.resetFeed}>{t.resetSplits}</button>
      </div>
      <button className={sidebarBtn(false, 'mt-2 block w-full text-center')} onClick={() => { demo.setView('grid'); demo.setIgFeed([]) }}>
        {t.backToGrid}
      </button>
    </div>
  )
}
