import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { useEditor } from '../EditorContext'
import { SectionRow } from './SectionRow'

// Editor sidebar sets block: the sets list with drag-reorder + Add Set.
export function SectionList() {
  const { session, sections: sec } = useEditor()
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [sectionDragOverId, setSectionDragOverId] = useState<string | null>(null)

  return (
    <div className="px-[18px] pt-5 pb-3">
      <div className="mb-2.5 flex items-center justify-between px-1 text-[11px] font-medium text-muted">
        <span>סטים</span>
        <button
          onClick={() => sec.setShowAddSetModal(true)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-hair bg-transparent px-1.5 py-1 text-[11px] font-medium text-ink hover:bg-sunken"
        >
          <Icon name="plus" size={12} strokeWidth={2} />
          <span>סט חדש</span>
        </button>
      </div>

      {session.sections.map(s => (
        <SectionRow
          key={s.id}
          section={s}
          draggedSectionId={draggedSectionId}
          setDraggedSectionId={setDraggedSectionId}
          sectionDragOverId={sectionDragOverId}
          setSectionDragOverId={setSectionDragOverId}
        />
      ))}
    </div>
  )
}
