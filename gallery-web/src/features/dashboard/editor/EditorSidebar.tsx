import { Icon, type IconName } from '@/shared/ui/Icon'
import { bg, bgSubtle, border, textMuted, textPrimary } from '../styles'
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
    <aside className="dash-editor-sidebar" style={{
      width: 260, flexShrink: 0,
      borderInlineStart: `1px solid ${border}`,
      background: bg,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      <div style={{
        aspectRatio: '4 / 3', width: '100%', overflow: 'hidden',
        background: editorCover ? bgSubtle : `linear-gradient(135deg, ${bgSubtle}, ${border})`,
        borderBottom: `1px solid ${border}`,
        position: 'relative',
      }}>
        {editorCover ? (
          <img src={editorCover} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: textMuted,
          }}>
            <Icon name="photo" size={32} strokeWidth={1.2} />
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-around',
        padding: '14px 12px', borderBottom: `1px solid ${border}`,
      }}>
        {TABS.map(t => {
          const active = editTab === t.id
          return (
            <button key={t.id} onClick={() => setEditTab(t.id)} aria-label={t.label} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 8, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4,
              color: active ? textPrimary : textMuted,
              fontFamily: 'inherit',
              position: 'relative',
            }}>
              <Icon name={t.icon} size={18} strokeWidth={active ? 1.85 : 1.5} />
              {active && (
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: textPrimary,
                }}>{t.label}</span>
              )}
            </button>
          )
        })}
      </div>

      {editTab === 'photos' && <SectionList />}
    </aside>
  )
}
