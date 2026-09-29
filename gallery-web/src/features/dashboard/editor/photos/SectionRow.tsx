import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, cardSolid, textMuted, textPrimary } from '../../styles'
import type { GallerySection } from '../../types'
import { useEditor } from '../EditorContext'

// One set in the sidebar: drag handle, name (or rename input), count, "…" menu.
// Select and menu are sibling buttons (nested buttons are invalid HTML).
export function SectionRow({ section: s, draggedSectionId, setDraggedSectionId, sectionDragOverId, setSectionDragOverId }: {
  section: GallerySection
  draggedSectionId: string | null
  setDraggedSectionId: (id: string | null) => void
  sectionDragOverId: string | null
  setSectionDragOverId: (id: string | null) => void
}) {
  const { session, sections: sec } = useEditor()
  const { activeSectionId, setActiveSectionId, galleryImages } = session
  const {
    renamingSectionId, sectionRenameDraft, setSectionRenameDraft,
    sectionMenuOpenId, setSectionMenuOpenId,
    startRename, commitRename, cancelRename, deleteSection, reorderSection,
  } = sec
  const isActive = activeSectionId === s.id
  const count = galleryImages.filter(im => im.section_id === s.id).length
  const isRenaming = renamingSectionId === s.id
  const isMenuOpen = sectionMenuOpenId === s.id
  const isDragSource = draggedSectionId === s.id
  const isDropTarget = sectionDragOverId === s.id && draggedSectionId && draggedSectionId !== s.id

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        if (isRenaming) return
        setDraggedSectionId(s.id)
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', s.id) } catch {}
      }}
      onDragOver={(e) => {
        if (!draggedSectionId || draggedSectionId === s.id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (sectionDragOverId !== s.id) setSectionDragOverId(s.id)
      }}
      onDragLeave={() => {
        if (sectionDragOverId === s.id) setSectionDragOverId(null)
      }}
      onDrop={(e) => {
        if (!draggedSectionId) return
        e.preventDefault()
        const src = draggedSectionId
        setDraggedSectionId(null); setSectionDragOverId(null)
        if (src && src !== s.id) void reorderSection(src, s.id)
      }}
      onDragEnd={() => { setDraggedSectionId(null); setSectionDragOverId(null) }}
      style={{
        position: 'relative',
        background: isDropTarget ? bgSubtle : (isActive ? bgSubtle : 'transparent'),
        opacity: isDragSource ? 0.4 : 1,
        transition: 'background .15s, opacity .15s',
        cursor: isRenaming ? 'text' : 'grab',
        borderTop: isDropTarget ? `1px solid ${textPrimary}` : '1px solid transparent',
      }}>
      <button onClick={() => { setActiveSectionId(s.id); setSectionMenuOpenId(null) }} style={{
        width: '100%', textAlign: 'right' as const,
        padding: '10px 36px 10px 12px', borderRadius: 2,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        color: textPrimary,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span aria-hidden="true" style={{
          opacity: 0.4, color: textMuted,
          display: 'inline-flex',
          fontSize: 12, lineHeight: 1,
        }}>≡</span>
        {isRenaming ? (
          <input
            autoFocus
            value={sectionRenameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setSectionRenameDraft(e.target.value)}
            onBlur={() => commitRename(s.id, s.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                cancelRename()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            style={{
              flex: 1, minWidth: 0,
              border: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: textPrimary, outline: 'none', padding: 0,
            }}
          />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
        )}
        <span style={{ color: textMuted, fontSize: 12, fontWeight: 400 }}>
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSectionMenuOpenId(isMenuOpen ? null : s.id) }}
        aria-label="עוד פעולות לסקשן"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        style={{
          position: 'absolute', top: 8, insetInlineEnd: 6,
          width: 24, height: 24, borderRadius: 2,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: textMuted,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="menu" size={14} strokeWidth={1.85} />
      </button>
      {isMenuOpen && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 8,
          background: cardSolid, border: `1px solid ${border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,.08)', zIndex: 5,
          minWidth: 140, padding: 4,
        }}>
          <button
            onClick={() => startRename(s.id, s.name)}
            style={{
              width: '100%', textAlign: 'right' as const,
              padding: '8px 10px', borderRadius: 2,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, color: textPrimary,
            }}
          >שינוי שם</button>
          <button onClick={() => { deleteSection(s.id); setSectionMenuOpenId(null) }} style={{
            width: '100%', textAlign: 'right' as const,
            padding: '8px 10px', borderRadius: 2,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, color: '#dc2626',
          }}>מחיקה</button>
        </div>
      )}
    </div>
  )
}
