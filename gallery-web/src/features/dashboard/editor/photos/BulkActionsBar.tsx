import { Icon } from '@/shared/ui/Icon'
import { textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'

// Sticky select-mode toolbar. Wraps on narrow viewports so the trailing
// controls are never pushed off-screen.
export function BulkActionsBar() {
  const { session, photos } = useEditor()
  const { sections, activeSectionId } = session
  const {
    selectedImageIds, selectAllImages, bulkToggleTopPick, bulkMoveToSection,
    bulkDownloadSelected, bulkDeleteSelected, exitSelectMode,
  } = photos
  // Only other sets are useful move destinations.
  const otherSections = sections.filter(s => s.id !== activeSectionId)

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      marginBottom: 16, padding: '10px 16px',
      background: textPrimary, color: '#fff',
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      fontSize: 12,
    }}>
      <span style={{ fontWeight: 500, letterSpacing: '0.04em' }}>
        {selectedImageIds.size} {selectedImageIds.size === 1 ? 'תמונה נבחרה' : 'תמונות נבחרו'}
      </span>
      <button onClick={selectAllImages} style={{
        marginInlineStart: 'auto',
        background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
        color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>בחר הכל</button>
      <button onClick={() => bulkToggleTopPick(true)} style={{
        background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
        color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>★ Pin</button>
      <button onClick={() => bulkToggleTopPick(false)} style={{
        background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
        color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>Unpin</button>
      {otherSections.length > 0 && (
        <select
          aria-label="העבר לסט"
          value=""
          onChange={(e) => { if (e.target.value) void bulkMoveToSection(e.target.value) }}
          style={{
            background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
            color: '#fff', padding: '6px 10px', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.08em',
          }}
        >
          <option value="" style={{ color: '#111' }}>העבר לסט…</option>
          {otherSections.map(s => (
            <option key={s.id} value={s.id} style={{ color: '#111' }}>{s.name}</option>
          ))}
        </select>
      )}
      <button onClick={() => void bulkDownloadSelected()} style={{
        background: 'transparent', border: `1px solid rgba(255,255,255,.4)`, borderRadius: 2,
        color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>Download</button>
      <button onClick={bulkDeleteSelected} style={{
        background: '#dc2626', border: `1px solid #dc2626`, borderRadius: 2,
        color: '#fff', padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'inherit', fontWeight: 500,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>Delete</button>
      <button onClick={exitSelectMode} aria-label="Cancel" style={{
        background: 'transparent', border: 'none',
        color: '#fff', padding: '6px 8px', cursor: 'pointer',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center',
      }}>
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
