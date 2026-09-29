import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import type { GallerySection } from '../../types'
import { useEditor } from '../EditorContext'

const menuItem = 'w-full cursor-pointer rounded-hair bg-transparent px-2.5 py-2 text-right text-[12px]'

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
      className={cn(
        'relative border-t transition-[background-color,opacity] duration-150',
        isDropTarget || isActive ? 'bg-surface' : 'bg-transparent',
        isDragSource ? 'opacity-40' : 'opacity-100',
        isRenaming ? 'cursor-text' : 'cursor-grab',
        isDropTarget ? 'border-ink' : 'border-transparent',
      )}>
      <button
        onClick={() => { setActiveSectionId(s.id); setSectionMenuOpenId(null) }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-hair bg-transparent py-2.5 pr-9 pl-3 text-right text-[13px] text-ink',
          isActive ? 'font-semibold' : 'font-medium',
        )}
      >
        <span aria-hidden="true" className="inline-flex text-[12px] leading-none text-muted opacity-40">≡</span>
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
            className="min-w-0 flex-1 bg-transparent p-0 text-[13px] font-semibold text-ink outline-none"
          />
        ) : (
          <span className="flex-1 truncate">
            {s.name}
          </span>
        )}
        <span className="text-[12px] font-normal text-muted">
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSectionMenuOpenId(isMenuOpen ? null : s.id) }}
        aria-label="עוד פעולות לסקשן"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="absolute end-1.5 top-2 inline-flex size-6 cursor-pointer items-center justify-center rounded-hair bg-transparent text-muted"
      >
        <Icon name="menu" size={14} strokeWidth={1.85} />
      </button>
      {isMenuOpen && (
        <div className="absolute start-2 top-full z-[5] min-w-[140px] border border-line bg-raised p-1 shadow-card">
          <button
            onClick={() => startRename(s.id, s.name)}
            className={cn(menuItem, 'text-ink')}
          >שינוי שם</button>
          <button
            onClick={() => { deleteSection(s.id); setSectionMenuOpenId(null) }}
            className={cn(menuItem, 'text-danger-strong')}
          >מחיקה</button>
        </div>
      )}
    </div>
  )
}
