import { cn } from '@/shared/ui'
import { Icon, type IconName } from '@/shared/ui/Icon'
import type { EditorTab } from '../types'
import { useEditor, useOpenGallery } from './EditorContext'
import { SectionList } from './photos/SectionList'

const TABS: Array<{ id: EditorTab; icon: IconName; label: string }> = [
  { id: 'photos',     icon: 'photo',    label: 'תמונות' },
  { id: 'stories',    icon: 'stories',  label: 'סטוריז' },
  { id: 'welcome',    icon: 'palette',  label: 'עיצוב' },
  { id: 'activities', icon: 'activity', label: 'פעילות' },
  { id: 'settings',   icon: 'settings', label: 'הגדרות' },
]

// Cover preview, the icon tab strip (label under the active tab only) and,
// on the Photos tab, the list of sets.
export function EditorSidebar() {
  const { session, coverFallback } = useEditor()
  const gallery = useOpenGallery()
  const { editTab, setEditTab } = session
  const editorCover = ((gallery.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined)
    || coverFallback[gallery.id]
    || null

  return (
    <aside className="dash-editor-sidebar flex w-[260px] shrink-0 flex-col overflow-y-auto border-s border-line bg-canvas">
      {/* No display class here: legacy CSS hides this first child on narrow screens. */}
      <div
        className={cn(
          'relative aspect-[4/3] w-full overflow-hidden border-b border-line',
          editorCover ? 'bg-surface' : 'bg-linear-135 from-surface to-line',
        )}
      >
        {editorCover ? (
          <img src={editorCover} alt="" className="block size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <Icon name="photo" size={32} strokeWidth={1.2} />
          </div>
        )}
      </div>

      <div className="flex justify-around border-b border-line px-3 py-3.5">
        {TABS.map(t => {
          const active = editTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setEditTab(t.id)}
              aria-label={t.label}
              className={cn(
                'relative flex cursor-pointer flex-col items-center gap-1 bg-transparent p-2',
                active ? 'text-ink' : 'text-muted',
              )}
            >
              <Icon name={t.icon} size={18} strokeWidth={active ? 1.85 : 1.5} />
              {active && (
                <span className="text-[9px] font-semibold tracking-[0.14em] text-ink uppercase">{t.label}</span>
              )}
            </button>
          )
        })}
      </div>

      {editTab === 'photos' && <SectionList />}
    </aside>
  )
}
