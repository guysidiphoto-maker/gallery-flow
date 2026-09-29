import { divider, overline, primaryBtn, sidebarBtn } from './classes'
import type { DemoCopy } from './copy'
import type { DemoState } from './useDemoState'

interface Props {
  t: DemoCopy
  demo: DemoState
  galleryUrl: string
}

export function DemoSidebar({ t, demo, galleryUrl }: Props) {
  const { view, filter, activeSection } = demo
  const inGrid = view === 'grid'
  return (
    <div className="flex w-[170px] shrink-0 flex-col gap-1 overflow-y-auto border-l border-white/6 p-3 max-md:w-full max-md:flex-row max-md:items-center max-md:overflow-x-auto max-md:border-l-0 max-md:border-b max-md:p-2">
      <button className={sidebarBtn(inGrid && filter === 'all')} onClick={() => { demo.setFilter('all'); demo.setView('grid') }}>
        {t.allPhotos} ({demo.photos.length})
      </button>
      <button className={sidebarBtn(inGrid && filter === 'picks')} onClick={() => { demo.setFilter('picks'); demo.setView('grid') }}>
        {t.topPicks} ({demo.topPicks.size})
      </button>
      <div className={divider} />
      <div className={`${overline} px-2.5 pt-1 pb-0.5 text-[0.7rem] tracking-[0.08em]`}>{t.sections}</div>
      {demo.sections.map((sec, idx) => (
        <button
          key={idx}
          className={sidebarBtn(activeSection === idx && inGrid)}
          onClick={() => { demo.setActiveSection(activeSection === idx ? null : idx); demo.setFilter('all'); demo.setView('grid') }}
        >
          {sec.name} ({sec.ids.size})
        </button>
      ))}
      <div className="flex gap-1 px-1">
        <input
          value={demo.newSecName}
          onChange={e => demo.setNewSecName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') demo.addSection() }}
          placeholder={t.newSection}
          className="flex-1 rounded-sm border border-white/10 bg-white/3 px-2 py-[5px] text-[0.75rem] text-white outline-none"
        />
      </div>
      <div className={divider} />
      <button className={sidebarBtn(view === 'stories')} onClick={() => { demo.setView('stories'); demo.setActiveSection(null) }}>{t.stories}</button>
      <button className={sidebarBtn(view === 'instagram')} onClick={() => { demo.setView('instagram'); demo.setActiveSection(null) }}>{t.instagram}</button>
      <div className={divider} />
      {!demo.published ? (
        <button className={primaryBtn()} onClick={() => { window.open(galleryUrl, '_blank'); demo.setPublished(true) }}>{t.publish}</button>
      ) : (
        <>
          <div className="text-center text-[0.8rem] text-(--mk-dot-green)">{t.published}</div>
          <button className={sidebarBtn()} onClick={() => demo.setPublished(false)}>{t.backToEditor}</button>
        </>
      )}
    </div>
  )
}
