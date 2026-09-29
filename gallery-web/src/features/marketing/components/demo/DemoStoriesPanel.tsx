import { chipBtn, overline, sidebarBtn } from './classes'
import type { DemoCopy } from './copy'
import { StoryPreview } from './StoryPreview'
import type { DemoState, StoryStyle } from './useDemoState'

const STYLES: Array<[StoryStyle, string]> = [['clean', 'Clean'], ['dynamic', 'Dynamic'], ['vintage', 'Vintage']]
const DURATIONS = [10, 15, 20, 30]
const option = 'flex-1 px-0 py-1.5 text-center text-[0.75rem]'
const label = `${overline} mb-1.5 text-[0.65rem] tracking-[0.1em]`

/** Story generator: pick style + length, preview built from the top picks. */
export function DemoStoriesPanel({ t, demo }: { t: DemoCopy; demo: DemoState }) {
  return (
    <div className="p-5 text-center">
      <h3 className="mb-4 text-[1rem] font-bold text-white/85">{t.storiesTitle}</h3>
      {demo.storyPhotos.length < 3 ? (
        <p className="my-8 text-[0.85rem] text-white/40">{t.storiesMin}</p>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="min-w-[120px] flex-1">
              <div className={label}>{t.style}</div>
              <div className="flex gap-1">
                {STYLES.map(([s, name]) => (
                  <button key={s} className={chipBtn(demo.storyStyle === s, option)} onClick={() => demo.setStoryStyle(s)}>{name}</button>
                ))}
              </div>
            </div>
            <div className="min-w-[120px] flex-1">
              <div className={label}>{t.duration}</div>
              <div className="flex gap-1">
                {DURATIONS.map(d => (
                  <button key={d} className={chipBtn(demo.storyDuration === d, option)} onClick={() => demo.setStoryDuration(d)}>{d}s</button>
                ))}
              </div>
            </div>
          </div>
          <StoryPreview
            photos={demo.storyPhotos.map(p => p.url)}
            style={demo.storyStyle}
            duration={demo.storyDuration}
            note={t.storyNote}
          />
        </div>
      )}
      <button className={sidebarBtn(false, 'mt-2.5 block w-full text-center')} onClick={() => demo.setView('grid')}>{t.backToGrid}</button>
    </div>
  )
}
