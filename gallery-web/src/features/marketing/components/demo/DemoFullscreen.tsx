import { createPortal } from 'react-dom'
import type { DemoCopy, DemoLang } from './copy'
import { DemoIgPanel } from './DemoIgPanel'
import { DemoPhotoGrid } from './DemoPhotoGrid'
import { DemoSidebar } from './DemoSidebar'
import { DemoStoriesPanel } from './DemoStoriesPanel'
import type { DemoState } from './useDemoState'

interface Props {
  t: DemoCopy
  lang: DemoLang
  demo: DemoState
  galleryUrl: string
}

/** Fullscreen editor, portalled to <body> so no ancestor overflow/transform clips it. */
export function DemoFullscreen({ t, lang, demo, galleryUrl }: Props) {
  return createPortal(
    <div
      className="mk-root fixed inset-0 z-200 flex animate-[mk-lp-demo-enter_0.3s_ease] flex-col bg-night"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      onMouseEnter={() => { demo.hoverRef.current = true }}
      onMouseLeave={() => { demo.hoverRef.current = false }}
    >
      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-white/6 px-4">
        <span className="text-[0.9rem] font-bold text-white/80">Pixflow Demo</span>
        <span className="flex-1 text-center text-[0.75rem] text-white/40">
          {demo.photos.length} {t.photos} &middot; {demo.selected.size} {t.selected} &middot; {demo.topPicks.size} {t.picks}
        </span>
        <button
          className="cursor-pointer rounded-sm border border-white/10 bg-white/6 px-3.5 py-[5px] text-[0.75rem] font-semibold text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => demo.setFullscreen(false)}
        >
          {t.exitDemo}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden max-md:flex-col">
        <DemoSidebar t={t} demo={demo} galleryUrl={galleryUrl} />
        <div className="flex-1 overflow-y-auto p-2">
          {demo.view === 'grid' ? <DemoPhotoGrid demo={demo} />
            : demo.view === 'stories' ? <DemoStoriesPanel t={t} demo={demo} />
            : <DemoIgPanel t={t} demo={demo} />}
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center justify-center border-t border-white/5 text-[0.7rem] text-white/30">{t.hint}</div>
    </div>,
    document.body,
  )
}
